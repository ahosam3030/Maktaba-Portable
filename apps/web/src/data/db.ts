import Dexie, { type Table } from 'dexie';

export interface LocalOrganization { id: string; name: string; slug: string; phone?: string; localOnly: boolean; linkedUserId?: string; linkedUserEmail?: string; updatedAt: string; }
export interface SyncOperation { id: string; entity: 'organization'; action: 'create'; payload: Omit<LocalOrganization, 'localOnly' | 'updatedAt'>; createdAt: string; status: 'pending' | 'synced' | 'failed'; }
export interface Supplier { id: string; name: string; phone?: string; notes?: string; createdAt: string; }
export interface Product { id: string; name: string; barcode?: string; category?: string; defaultUnit: 'piece' | 'box'; piecesPerBox: number; createdAt: string; }
export interface PurchaseLine { id: string; productId: string; productName: string; barcode?: string; unit: 'piece' | 'box'; quantity: number; piecesPerUnit: number; unitPrice: number; returnedQuantity: number; }
export interface PurchaseInvoice { id: string; invoiceNo: string; supplierId: string; supplierName: string; date: string; lines: PurchaseLine[]; subtotal: number; discount: number; total: number; paid: number; notes?: string; createdAt: string; }
export interface SupplierPayment { id: string; supplierId: string; supplierName: string; date: string; amount: number; method: string; reference?: string; }
export interface PurchaseReturn { id: string; returnNo: string; invoiceId: string; invoiceNo: string; supplierId: string; supplierName: string; date: string; lines: Array<{ productId: string; productName: string; quantity: number; unit: 'piece' | 'box'; unitPrice: number; total: number }>; total: number; }

/** @deprecated kept for old local records */
export type PrintServiceKind = 'copy' | 'print' | 'scan' | 'lamination' | 'binding' | 'other' | string;

export type PrintChargeUnit = 'page' | 'copy' | 'job';

/** Dynamic print/copy service defined by the user */
export interface PrintService {
  id: string;
  name: string;
  unitPrice: number;
  /** page = سعر × صفحات × نسخ | copy = سعر × نسخ | job = سعر ثابت */
  chargeUnit: PrintChargeUnit;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrintJob {
  id: string;
  receiptNo: string;
  date: string;
  customerName?: string;
  /** dynamic service id */
  serviceId?: string;
  /** display name snapshot */
  serviceName: string;
  /** legacy field */
  service?: PrintServiceKind;
  description: string;
  paperSize: 'A4' | 'A3' | 'Other' | string;
  colorMode: 'bw' | 'color' | string;
  pages: number;
  copies: number;
  sides: 'single' | 'double' | string;
  unitPrice: number;
  extraFees: number;
  discount: number;
  total: number;
  paid: number;
  notes?: string;
  createdAt: string;
}

/** @deprecated old fixed pricing row */
export interface PrintPricing {
  id: string;
  copyBwA4: number; copyColorA4: number; printBwA4: number; printColorA4: number;
  copyBwA3: number; copyColorA3: number; printBwA3: number; printColorA3: number;
  scanPage: number; lamination: number; binding: number; updatedAt: string;
}

export interface CashTransaction {
  id: string; kind: 'income' | 'expense'; date: string; category: string; amount: number;
  method: 'cash' | 'wallet' | 'bank' | 'card'; reference?: string; notes?: string; createdAt: string;
}

export const DEFAULT_PRINT_SERVICES: Omit<PrintService, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'تصوير A4 أبيض وأسود', unitPrice: 1, chargeUnit: 'page', active: true, sortOrder: 1 },
  { name: 'تصوير A4 ألوان', unitPrice: 3, chargeUnit: 'page', active: true, sortOrder: 2 },
  { name: 'طباعة A4 أبيض وأسود', unitPrice: 1.5, chargeUnit: 'page', active: true, sortOrder: 3 },
  { name: 'طباعة A4 ألوان', unitPrice: 4, chargeUnit: 'page', active: true, sortOrder: 4 },
  { name: 'مسح ضوئي / سكانر', unitPrice: 2, chargeUnit: 'page', active: true, sortOrder: 5 },
  { name: 'تغليف حراري', unitPrice: 10, chargeUnit: 'copy', active: true, sortOrder: 6 },
  { name: 'تجليد', unitPrice: 15, chargeUnit: 'job', active: true, sortOrder: 7 },
  { name: 'خدمة عامة / أخرى', unitPrice: 0, chargeUnit: 'job', active: true, sortOrder: 8 },
];

/** طلبات معلقة للمزامنة مع الخادم عند عودة الاتصال */
export interface OutboxItem {
  id: string;
  method: string;
  path: string;
  body: string | null;
  label: string;
  organizationId?: string | null;
  createdAt: string;
  status: 'pending' | 'processing' | 'failed' | 'done';
  attempts: number;
  lastError?: string;
  permanent?: boolean;
}

class LibraryDatabase extends Dexie {
  organizations!: Table<LocalOrganization, string>;
  syncQueue!: Table<SyncOperation, string>;
  suppliers!: Table<Supplier, string>;
  products!: Table<Product, string>;
  purchaseInvoices!: Table<PurchaseInvoice, string>;
  supplierPayments!: Table<SupplierPayment, string>;
  purchaseReturns!: Table<PurchaseReturn, string>;
  printJobs!: Table<PrintJob, string>;
  printPricing!: Table<PrintPricing, string>;
  printServices!: Table<PrintService, string>;
  cashTransactions!: Table<CashTransaction, string>;
  outbox!: Table<OutboxItem, string>;

  constructor() {
    super('library-erp-local');
    this.version(1).stores({ organizations: 'id, slug, name, localOnly, updatedAt', syncQueue: 'id, entity, action, status, createdAt' });
    this.version(2).stores({
      organizations: 'id, slug, name, localOnly, updatedAt', syncQueue: 'id, entity, action, status, createdAt',
      suppliers: 'id, name, phone, createdAt', products: 'id, name, barcode, category, createdAt',
      purchaseInvoices: 'id, invoiceNo, supplierId, supplierName, date, createdAt',
      supplierPayments: 'id, supplierId, supplierName, date', purchaseReturns: 'id, returnNo, invoiceId, supplierId, date',
    });
    this.version(3).stores({
      organizations: 'id, slug, name, localOnly, updatedAt', syncQueue: 'id, entity, action, status, createdAt',
      suppliers: 'id, name, phone, createdAt', products: 'id, name, barcode, category, createdAt',
      purchaseInvoices: 'id, invoiceNo, supplierId, supplierName, date, createdAt',
      supplierPayments: 'id, supplierId, supplierName, date', purchaseReturns: 'id, returnNo, invoiceId, supplierId, date',
      printJobs: 'id, receiptNo, date, service, customerName, createdAt', printPricing: 'id, updatedAt',
    });
    this.version(4).stores({
      organizations: 'id, slug, name, localOnly, updatedAt', syncQueue: 'id, entity, action, status, createdAt',
      suppliers: 'id, name, phone, createdAt', products: 'id, name, barcode, category, createdAt',
      purchaseInvoices: 'id, invoiceNo, supplierId, supplierName, date, createdAt',
      supplierPayments: 'id, supplierId, supplierName, date', purchaseReturns: 'id, returnNo, invoiceId, supplierId, date',
      printJobs: 'id, receiptNo, date, service, customerName, createdAt', printPricing: 'id, updatedAt',
      cashTransactions: 'id, kind, date, category, method, reference, createdAt',
    });
    this.version(5).stores({
      organizations: 'id, slug, name, localOnly, updatedAt', syncQueue: 'id, entity, action, status, createdAt',
      suppliers: 'id, name, phone, createdAt', products: 'id, name, barcode, category, createdAt',
      purchaseInvoices: 'id, invoiceNo, supplierId, supplierName, date, createdAt',
      supplierPayments: 'id, supplierId, supplierName, date', purchaseReturns: 'id, returnNo, invoiceId, supplierId, date',
      printJobs: 'id, receiptNo, date, service, serviceId, serviceName, customerName, createdAt',
      printPricing: 'id, updatedAt',
      printServices: 'id, name, active, sortOrder, updatedAt',
      cashTransactions: 'id, kind, date, category, method, reference, createdAt',
    });
    this.version(6).stores({
      organizations: 'id, slug, name, localOnly, updatedAt',
      syncQueue: 'id, entity, action, status, createdAt',
      suppliers: 'id, name, phone, createdAt',
      products: 'id, name, barcode, category, createdAt',
      purchaseInvoices: 'id, invoiceNo, supplierId, supplierName, date, createdAt',
      supplierPayments: 'id, supplierId, supplierName, date',
      purchaseReturns: 'id, returnNo, invoiceId, supplierId, date',
      printJobs: 'id, receiptNo, date, service, serviceId, serviceName, customerName, createdAt',
      printPricing: 'id, updatedAt',
      printServices: 'id, name, active, sortOrder, updatedAt',
      cashTransactions: 'id, kind, date, category, method, reference, createdAt',
      outbox: 'id, status, createdAt, path',
    });
  }
}

export const db = new LibraryDatabase();

export async function ensureDefaultPrintServices(): Promise<PrintService[]> {
  const existing = await db.printServices.orderBy('sortOrder').toArray();
  if (existing.length > 0) return existing;
  const now = new Date().toISOString();
  const rows: PrintService[] = DEFAULT_PRINT_SERVICES.map((s, i) => ({
    id: crypto.randomUUID(),
    ...s,
    createdAt: now,
    updatedAt: now,
    sortOrder: s.sortOrder ?? i + 1,
  }));
  await db.printServices.bulkAdd(rows);
  return rows;
}
