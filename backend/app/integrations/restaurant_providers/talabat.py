"""Authorized Talabat connector — disabled unless officially authorized.

Research notes (see docs/restaurant-imports.md): Talabat does not publish a
public restaurant/menu discovery API. Its documented integration route is the
partner "Restaurant Integration API" for restaurants/POS vendors, with access
granted on request through integration.talabat.com.

This module therefore implements only configuration gating. It contains no
endpoint paths: those must come from the official documentation provided with
an approved partnership, and are injected through configuration. No scraping,
private endpoints or bypassing of access controls is performed — ever. When the
connector is not configured, the rest of EMS Food works normally.
"""

from app.core.config import get_settings
from app.integrations.restaurant_providers.base import DiscoveredRestaurant, ProviderNotConfigured
from app.models import Restaurant
from app.services.menu_import.types import ExtractionOutput

NOT_CONFIGURED = (
    "Talabat integration is disabled. It requires official partner authorization, API credentials and the "
    "permitted endpoint documentation from Talabat. Use menu file import or manual entry instead."
)


class AuthorizedTalabatProvider:
    key = "talabat"
    name = "Talabat (authorized partners only)"
    capabilities: tuple[str, ...] = ()

    def is_configured(self) -> bool:
        settings = get_settings()
        return bool(
            settings.talabat_integration_enabled
            and settings.talabat_api_base_url
            and settings.talabat_client_id
            and settings.talabat_client_secret
        )

    def is_enabled(self) -> bool:
        return self.is_configured()

    def status_message(self) -> str:
        if not self.is_configured():
            return NOT_CONFIGURED
        return (
            "Credentials are configured, but the authorized endpoints have not been implemented yet. "
            "Add them in app/integrations/restaurant_providers/talabat.py from the official partner docs."
        )

    def discover_restaurants(self, query: str) -> list[DiscoveredRestaurant]:
        raise ProviderNotConfigured(self.key, self.status_message())

    def fetch_menu(self, restaurant: Restaurant) -> ExtractionOutput:
        raise ProviderNotConfigured(self.key, self.status_message())
