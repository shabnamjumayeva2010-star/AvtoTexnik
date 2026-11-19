import type { ComputedMaintenance, MaintenanceItem, MaintenanceStatus, Vehicle } from '../types.ts';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(value)).replace(/,/g, ' ');
}

export function formatCurrencyUzs(amount: number): string {
  return `${formatNumber(amount)} so'm`;
}

export function formatKm(km: number): string {
  return `${formatNumber(km)} km`;
}

export function computeMaintenanceStatus(item: MaintenanceItem, vehicle: Vehicle): ComputedMaintenance {
  const nextDueKm = item.lastServiceKm + item.intervalKm;
  const remainingKm = nextDueKm - vehicle.currentKm;
  const kmUsed = Math.max(0, vehicle.currentKm - item.lastServiceKm);

  const lastDate = new Date(item.lastServiceDate);
  const dueDate = new Date(lastDate);
  dueDate.setMonth(dueDate.getMonth() + item.intervalMonths);

  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const remainingDaysByCalendar = Math.ceil((dueDate.getTime() - now.getTime()) / msPerDay);
  const dailyKm = Math.max(10, vehicle.avgDailyKm || 40);
  const remainingDaysByMileage = Math.ceil(remainingKm / dailyKm);
  const remainingDays = Math.min(remainingDaysByCalendar, remainingDaysByMileage);

  const kmRatio = item.intervalKm > 0 ? kmUsed / item.intervalKm : 0;
  const totalDays = Math.max(1, item.intervalMonths * 30);
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - lastDate.getTime()) / msPerDay));
  const timeRatio = elapsedDays / totalDays;

  const wearPercent = Math.min(100, Math.max(0, Math.round(Math.max(kmRatio, timeRatio) * 100)));

  let status: MaintenanceStatus = 'ok';
  if (remainingKm <= 0 || remainingDays <= 0 || wearPercent >= 100) {
    status = 'overdue';
  } else if (remainingKm <= 1200 || remainingDays <= 21 || wearPercent >= 82) {
    status = 'due_soon';
  }

  return {
    ...item,
    nextDueKm,
    remainingKm,
    remainingDays,
    wearPercent,
    status,
  };
}

export function getStatusLabel(status: MaintenanceStatus): string {
  switch (status) {
    case 'overdue':
      return "Muddati o'tgan";
    case 'due_soon':
      return 'Tez orada';
    case 'ok':
      return "Me'yorda";
  }
}

export function getCategoryLabel(category: string): string {
  switch (category) {
    case 'oil':
      return 'Dvigatel moyi';
    case 'filter':
      return 'Filtrlar';
    case 'brakes':
      return 'Tormoz tizimi';
    case 'ignition':
      return "O't oldirish";
    case 'chassis':
      return 'Yurish qismi';
    case 'battery':
      return 'Elektronika';
    default:
      return 'Texnik qism';
  }
}
