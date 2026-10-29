from app.integrations.restaurant_providers.base import DiscoveredRestaurant, ProviderNotConfigured
from app.models import Restaurant
from app.services.menu_import import ocr
from app.services.menu_import.pipeline import extract
from app.services.menu_import.types import ExtractionOutput


class FileImportMenuProvider:
    """Menus supplied by restaurants as PDF, image, CSV or Excel files (free, open-source extraction)."""

    key = "file_import"
    name = "Menu file import"
    capabilities = ("import_pdf", "import_image", "import_csv", "import_xlsx")

    def is_enabled(self) -> bool:
        return True

    def status_message(self) -> str:
        status = ocr.ocr_availability()
        if not status.available:
            return "PDF (text), CSV and Excel imports work. " + status.message
        if not status.arabic:
            return "All formats work; " + status.message
        return "All formats work, including OCR for English and Arabic images and scanned PDFs."

    def discover_restaurants(self, query: str) -> list[DiscoveredRestaurant]:
        return []

    def fetch_menu(self, restaurant: Restaurant) -> ExtractionOutput:
        raise ProviderNotConfigured(self.key, "Upload a menu file to import it.")

    def extract_file(self, data: bytes, source_type: str) -> ExtractionOutput:
        return extract(data, source_type)
