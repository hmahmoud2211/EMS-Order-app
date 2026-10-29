/**
 * Types mirroring the FastAPI schemas (backend/app/schemas). Money values are
 * decimal strings ("180.00"); timestamps are ISO-8601 UTC; dates are "YYYY-MM-DD".
 */

export type Money = string;
export type Role = 'ADMIN' | 'EMPLOYEE';
export type SessionStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'FINALIZED' | 'CANCELLED';
export type OrderStatus = 'SUBMITTED' | 'CANCELLED';
export type FeeAllocation = 'NONE' | 'EQUAL' | 'PROPORTIONAL';
export type ImportStatus = 'PROCESSING' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED' | 'FAILED';

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface NotificationPrefs {
  session_updates: boolean;
  deadline_reminders: boolean;
  order_updates: boolean;
}

export interface CurrentUser {
  id: string;
  full_name: string;
  username: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  role: Role;
  is_active: boolean;
  participates_in_orders: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  notification_prefs: Partial<NotificationPrefs>;
  preferred_language: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  access_token_expires_at: string;
}

export interface LoginResponse extends TokenPair {
  user: CurrentUser;
}

export interface Employee {
  id: string;
  full_name: string;
  username: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  role: Role;
  is_active: boolean;
  participates_in_orders: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface EmployeeCreated {
  employee: Employee;
  temporary_password: string | null;
}

export interface EmployeeImportResult {
  dry_run: boolean;
  total_rows: number;
  valid_rows: number;
  rows: {
    row: number;
    full_name: string | null;
    username: string | null;
    email: string | null;
    department: string | null;
    errors: string[];
  }[];
  created: { full_name: string; username: string; temporary_password: string }[];
}

export interface PasswordResetIssued {
  method: 'code' | 'temporary_password';
  secret: string;
  expires_at: string | null;
}

export interface RestaurantSummary {
  id: string;
  name: string;
  branch: string | null;
  cuisine: string | null;
  description: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
}

export interface Restaurant extends RestaurantSummary {
  source_provider: 'MANUAL' | 'FILE_IMPORT' | 'TALABAT';
  external_reference: string | null;
  last_synced_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RestaurantListItem extends Restaurant {
  item_count: number;
  category_count: number;
  last_selected_on: string | null;
}

export interface Modifier {
  id: string;
  name: string;
  additional_price: Money;
  is_available: boolean;
  display_order: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minimum_selections: number;
  maximum_selections: number;
  is_required: boolean;
  display_order: number;
  modifiers: Modifier[];
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: Money;
  currency: string;
  is_available: boolean;
  display_order: number;
  modifier_groups: ModifierGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  display_order: number;
  items: MenuItem[];
}

export interface Menu {
  restaurant: RestaurantSummary;
  categories: MenuCategory[];
  item_count: number;
}

export interface Session {
  id: string;
  session_date: string;
  restaurant_id: string;
  restaurant: RestaurantSummary;
  opens_at: string;
  closes_at: string;
  status: SessionStatus;
  notes: string | null;
  delivery_fee: Money;
  service_fee: Money;
  fee_note: string | null;
  fee_allocation: FeeAllocation;
  opened_at: string | null;
  closed_at: string | null;
  finalized_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionStats {
  participants: number;
  ordered: number;
  not_ordered: number;
  total_items: number;
  total_value: Money;
}

export interface SessionHistoryItem extends Session {
  stats: SessionStats;
}

export interface MyOrderSummary {
  id: string;
  reference: string;
  status: OrderStatus;
  total_amount: Money;
  item_count: number;
  submitted_at: string;
  updated_at: string;
}

export interface TodayResponse {
  server_time: string;
  business_date: string;
  session: Session | null;
  is_accepting_orders: boolean;
  accepting_reason: string | null;
  can_cancel_order: boolean;
  my_order: MyOrderSummary | null;
}

export interface SelectedModifier {
  group_id: string | null;
  group_name: string;
  modifier_id: string | null;
  name: string;
  price: Money;
}

export interface OrderItem {
  id: string;
  menu_item_id: string | null;
  item_name_snapshot: string;
  category_name_snapshot: string | null;
  quantity: number;
  base_price_snapshot: Money;
  unit_price_snapshot: Money;
  selected_modifiers_snapshot: SelectedModifier[];
  special_instructions: string | null;
  line_total: Money;
}

export interface Order {
  id: string;
  reference: string;
  status: OrderStatus;
  total_amount: Money;
  item_count: number;
  revision: number;
  submitted_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  employee: { id: string; full_name: string; department: string | null };
  session: { id: string; session_date: string; status: SessionStatus; closes_at: string; restaurant: RestaurantSummary };
  items: OrderItem[];
}

export interface OrderHistoryItem {
  id: string;
  reference: string;
  status: OrderStatus;
  total_amount: Money;
  item_count: number;
  submitted_at: string;
  session_date: string;
  restaurant_name: string;
  item_names: string[];
}

export interface OrderLineInput {
  menu_item_id: string;
  quantity: number;
  modifier_ids: string[];
  special_instructions?: string | null;
}

export interface DashboardMetrics {
  total_employees: number;
  ordered: number;
  not_ordered: number;
  total_items: number;
  total_value: Money;
  participation_pct: number;
}

export interface DashboardResponse {
  server_time: string;
  business_date: string;
  session: Session | null;
  metrics: DashboardMetrics | null;
  recent_orders: { order_id: string; employee_name: string; total_amount: Money; item_count: number; updated_at: string }[];
  not_ordered: { id: string; full_name: string; department: string | null }[];
  seconds_until_close: number | null;
}

export interface EmployeeStatusRow {
  employee_id: string;
  full_name: string;
  department: string | null;
  status: 'ORDERED' | 'NOT_ORDERED';
  order_id: string | null;
  order_reference: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  total_amount: Money | null;
  item_count: number;
}

export interface EmployeeStatusResponse {
  session_id: string;
  counts: { all: number; ordered: number; not_ordered: number };
  rows: EmployeeStatusRow[];
}

export interface ConsolidatedLine {
  item_name: string;
  category_name: string | null;
  quantity: number;
  unit_price: Money;
  modifiers: SelectedModifier[];
  special_instructions: string | null;
  line_total: Money;
}

export interface ConsolidatedResponse {
  session: Session;
  summary: {
    restaurant_name: string;
    restaurant_branch: string | null;
    restaurant_phone: string | null;
    order_date: string;
    session_status: SessionStatus;
    employees_ordered: number;
    meals: number;
    food_subtotal: Money;
    delivery_fee: Money;
    service_fee: Money;
    fees_total: Money;
    fee_note: string | null;
    fee_allocation: FeeAllocation;
    fees_are_admin_entered: boolean;
    final_total: Money;
  };
  by_employee: {
    employee_id: string;
    full_name: string;
    department: string | null;
    order_reference: string;
    lines: ConsolidatedLine[];
    subtotal: Money;
    allocated_fees: Money;
    total: Money;
  }[];
  by_item: {
    config_key: string;
    item_name: string;
    category_name: string | null;
    modifiers: SelectedModifier[];
    unit_price: Money;
    total_quantity: number;
    total_value: Money;
    order_count: number;
    employees: { full_name: string; quantity: number; special_instructions: string | null }[];
  }[];
  generated_at: string;
}

export interface OrderRevision {
  revision_no: number;
  action: string;
  actor_name: string | null;
  reason: string | null;
  created_at: string;
}

export interface AppSettings {
  company_name: string;
  allow_employee_cancellation: boolean;
  default_opens_at: string;
  default_closes_at: string;
  reminder_minutes_before_deadline: number;
  default_fee_allocation: FeeAllocation;
  currency: string;
}

export interface ProviderStatus {
  key: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  capabilities: string[];
  message: string;
}

export interface OcrStatus {
  available: boolean;
  version: string | null;
  languages: string[];
  arabic_available: boolean;
  message: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  data: Record<string, string>;
  is_read: boolean;
  created_at: string;
}

export interface NotificationList {
  items: AppNotification[];
  total: number;
  unread: number;
  limit: number;
  offset: number;
}

export interface DraftOption {
  name: string;
  price: Money | null;
}

export interface DraftItem {
  id: string;
  category: string;
  name: string;
  description: string | null;
  base_price: Money | null;
  sizes: DraftOption[];
  extras: DraftOption[];
  is_available: boolean;
  confidence: number;
  status: 'VALID' | 'NEEDS_REVIEW' | 'INVALID';
  issues: string[];
  duplicate_of: string | null;
  source: Record<string, unknown> | null;
}

export interface MenuImport {
  id: string;
  restaurant_id: string;
  source_type: 'PDF' | 'IMAGE' | 'CSV' | 'XLSX';
  original_filename: string;
  file_size: number;
  status: ImportStatus;
  warnings: { code: string; message: string }[];
  error_message: string | null;
  approved_at: string | null;
  approval_mode: 'replace' | 'merge' | null;
  stats: Record<string, number> | null;
  created_at: string;
  updated_at: string;
}

export interface MenuImportDetail extends MenuImport {
  extraction_result: { items: DraftItem[]; categories: string[]; meta: Record<string, unknown> } | null;
}

export interface SpendingAnalytics {
  date_from: string;
  date_to: string;
  total_value: Money;
  by_day: { session_date: string; restaurant_name: string; total_value: Money; orders: number }[];
  by_employee: { employee_id: string; full_name: string; orders: number; total_value: Money }[];
}

export interface ParticipationAnalytics {
  date_from: string;
  date_to: string;
  average_rate_pct: number;
  by_day: { session_date: string; restaurant_name: string; participants: number; ordered: number; rate_pct: number }[];
}
