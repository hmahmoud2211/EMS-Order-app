"""Background worker: `python -m app.workers.scheduler`.

Runs as its own process (one replica). A PostgreSQL advisory lock guarantees a
single active scheduler even if the worker is accidentally started twice.
"""

import signal
import time

import structlog
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import text

from app.core.clock import get_clock
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import SessionLocal, engine
from app.services import push_service
from app.workers import jobs

log = structlog.get_logger("worker")
ADVISORY_LOCK_ID = 7_413_002


def _run(job) -> None:
    db = SessionLocal()
    try:
        result = job(db, get_clock())
        if result:
            log.info("job_done", job=job.__name__, result=result)
    except Exception as exc:
        db.rollback()
        log.exception("job_failed", job=job.__name__, error=str(exc))
    finally:
        db.close()


def main() -> None:
    configure_logging()
    if get_settings().push_enabled:
        push_service.install_after_commit_hook(SessionLocal)
    lock_conn = engine.connect()
    while not lock_conn.execute(text("SELECT pg_try_advisory_lock(:id)"), {"id": ADVISORY_LOCK_ID}).scalar():
        log.info("scheduler_waiting_for_lock")
        time.sleep(30)

    scheduler = BackgroundScheduler(timezone="UTC", job_defaults={"coalesce": True, "max_instances": 1})
    scheduler.add_job(_run, "interval", minutes=1, args=[jobs.auto_close_sessions], id="auto_close")
    scheduler.add_job(_run, "interval", minutes=1, args=[jobs.notify_ordering_opened], id="open_notify")
    scheduler.add_job(_run, "interval", minutes=1, args=[jobs.deadline_reminders], id="reminders")
    scheduler.add_job(_run, "interval", minutes=15, args=[jobs.check_push_receipts], id="receipts")
    scheduler.add_job(_run, "interval", hours=6, args=[jobs.cleanup], id="cleanup")
    scheduler.start()
    log.info("scheduler_started")

    stopping = False

    def _stop(*_):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    try:
        while not stopping:
            time.sleep(1)
    finally:
        scheduler.shutdown(wait=False)
        lock_conn.close()
        log.info("scheduler_stopped")


if __name__ == "__main__":
    main()
