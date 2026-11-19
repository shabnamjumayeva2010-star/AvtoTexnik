export type ThemeMode = 'light' | 'dark';

export type NavTab = 'home' | 'reminders' | 'history' | 'cabinet';

export type PartCategory = 'oil' | 'filter' | 'brakes' | 'ignition' | 'chassis' | 'battery';

export type MaintenanceStatus = 'overdue' | 'due_soon' | 'ok';

export interface MaintenanceItem {
  id: string;
  vehicleId: string;
  name: string;
  category: PartCategory;
  intervalKm: number;
  intervalMonths: number;
  lastServiceKm: number;
  lastServiceDate: string; // ISO YYYY-MM-DD
  estimatedCostUzs: number;
  notes?: string;
}

export interface ComputedMaintenance extends MaintenanceItem {
  nextDueKm: number;
  remainingKm: number;
  remainingDays: number;
  wearPercent: number;
  status: MaintenanceStatus;
}

export interface Vehicle {
  id: string;
  clientId: string;
  brand: string;
  model: string;
  year: number;
  plateNumber: string;
  vin: string;
  currentKm: number;
  avgDailyKm: number;
  oilType: string;
  imageUrl?: string;
}

export interface ClientNotification {
  id: string;
  clientId: string;
  vehicleId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  priority: 'high' | 'normal';
}

export interface Client {
  id: string;
  fullName: string;
  phone: string;
  city: string;
  memberSince: string;
  notificationsEnabled: boolean;
}

export interface ServiceRecord {
  id: string;
  clientId: string;
  vehicleId: string;
  vehicleLabel: string;
  date: string;
  odometerKm: number;
  servicesPerformed: string[];
  partsReplaced: string[];
  technicianName: string;
  warrantyMonths: number;
  totalCostUzs: number;
  notes?: string;
}

export interface ServiceBooking {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  vehicleId: string;
  vehicleLabel: string;
  plateNumber: string;
  requestedServices: string[];
  preferredDate: string;
  preferredTime: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assignedMaster?: string;
  estimatedCostUzs: number;
  notes?: string;
  createdAt: string;
}

export interface InventoryPart {
  id: string;
  sku: string;
  name: string;
  category: PartCategory;
  brand: string;
  stockQty: number;
  minThreshold: number;
  unitPriceUzs: number;
}

export interface SecurityLogEntry {
  id: string;
  timestamp: string;
  event: string;
  actor: string;
  severity: 'info' | 'warning' | 'critical';
  ipAddress: string;
  details: string;
}

export interface ServiceCatalogItem {
  id: string;
  title: string;
  subtitle: string;
  durationLabel: string;
  priceFromUzs: number;
  category: PartCategory;
  imageUrl: string;
  includedChecks: string[];
}

export interface AdminSecurityConfigView {
  operatorId: string;
  totpEnabled: boolean;
  totpSecret: string;
  otpAuthUri: string;
  currentTotpPreview: string;
  lockedIpCount: number;
}

export interface AdminOverviewPayload {
  stats: {
    totalClients: number;
    totalVehicles: number;
    activeBookings: number;
    overdueItemsCount: number;
    lowStockCount: number;
    monthlyRevenueUzs: number;
  };
  clients: Client[];
  vehicles: Vehicle[];
  maintenanceItems: MaintenanceItem[];
  serviceRecords: ServiceRecord[];
  bookings: ServiceBooking[];
  inventory: InventoryPart[];
  securityLogs: SecurityLogEntry[];
  securityConfig: AdminSecurityConfigView;
  sessionExpiresAt: number;
}
