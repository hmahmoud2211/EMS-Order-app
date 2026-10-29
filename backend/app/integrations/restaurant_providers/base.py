"""Restaurant data provider interface.

The application depends only on this interface, never on a specific external
service, so restaurant data sources stay modular and optional.
"""

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from app.models import Restaurant
from app.services.menu_import.types import ExtractionOutput


class ProviderNotConfigured(Exception):
    def __init__(self, provider: str, message: str) -> None:
        self.provider = provider
        self.message = message
        super().__init__(message)


@dataclass
class DiscoveredRestaurant:
    name: str
    branch: str | None = None
    cuisine: str | None = None
    external_reference: str | None = None
    extra: dict = field(default_factory=dict)


@runtime_checkable
class RestaurantProvider(Protocol):
    key: str
    name: str
    capabilities: tuple[str, ...]

    def is_enabled(self) -> bool: ...

    def status_message(self) -> str: ...

    def discover_restaurants(self, query: str) -> list[DiscoveredRestaurant]: ...

    def fetch_menu(self, restaurant: Restaurant) -> ExtractionOutput: ...
