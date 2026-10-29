from app.integrations.restaurant_providers.base import DiscoveredRestaurant, ProviderNotConfigured
from app.models import Restaurant
from app.services.menu_import.types import ExtractionOutput


class ManualMenuProvider:
    """Menus created and maintained by the administrator inside EMS Food."""

    key = "manual"
    name = "Manual entry"
    capabilities = ("create_restaurants", "edit_menu")

    def is_enabled(self) -> bool:
        return True

    def status_message(self) -> str:
        return "Always available: add restaurants and menu items directly in the app."

    def discover_restaurants(self, query: str) -> list[DiscoveredRestaurant]:
        return []

    def fetch_menu(self, restaurant: Restaurant) -> ExtractionOutput:
        raise ProviderNotConfigured(self.key, "Manual menus are edited directly; there is nothing to fetch.")
