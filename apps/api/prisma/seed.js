/**
 * يمسح كل البيانات ويعيد مالك واحد.
 * يتطلب تأكيدًا صريحًا حتى لا يُشغَّل بالخطأ:
 *   set SEED_CONFIRM=YES
 *   npm run seed
 *
 * يمكن تخصيص الحساب عبر متغيرات البيئة:
 *   SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD, SEED_OWNER_NAME,
 *   SEED_ORG_NAME, SEED_ORG_SLUG, SEED_ORG_PHONE
 */
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const ALL_PERMISSIONS = [
  'purchases', 'sales', 'inventory', 'accounting', 'printing', 'reports', 'users',
];

function hashPassword(plain) {
  const iterations = 210000;
  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(plain, salt, iterations, 32, 'sha256');
  return `pbkdf2_sha256$${iterations}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function isStrongPassword(password) {
  if (!password || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

async function main() {
  if (process.env.SEED_CONFIRM !== 'YES') {
    console.error('مرفوض: لتأكيد مسح القاعدة اضبط SEED_CONFIRM=YES ثم أعد التشغيل.');
    console.error('مثال PowerShell:  $env:SEED_CONFIRM=\"YES\"; npm run seed');
    process.exit(1);
  }

  const password = process.env.SEED_OWNER_PASSWORD || '';
  if (!password || !isStrongPassword(password)) {
    console.error('عيّن SEED_OWNER_PASSWORD بكلمة مرور قوية (كبير+صغير+رقم+رمز).');
    console.error('مثال:  $env:SEED_OWNER_PASSWORD=\"YourPass@1\"');
    process.exit(1);
  }

  console.log('⚠ مسح كل المؤسسات والمستخدمين والبيانات...');

  // ترتيب الحذف يحترم قيود FK
  await prisma.drawerEvent.deleteMany().catch(() => {});
  await prisma.dayClose.deleteMany().catch(() => {});
  await prisma.saleReturnItem.deleteMany().catch(() => {});
  await prisma.saleReturn.deleteMany().catch(() => {});
  await prisma.serviceReceiptItem.deleteMany().catch(() => {});
  await prisma.serviceReceipt.deleteMany().catch(() => {});
  await prisma.service.deleteMany().catch(() => {});
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.purchaseReturnItem.deleteMany();
  await prisma.purchaseReturn.deleteMany();
  await prisma.supplierPayment.deleteMany();
  await prisma.purchaseInvoiceItem.deleteMany();
  await prisma.purchaseInvoice.deleteMany();
  await prisma.cashTransaction.deleteMany();
  await prisma.auditLog.deleteMany().catch(() => {});
  await prisma.product.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany().catch(() => {});
  await prisma.organization.deleteMany();

  const email = (process.env.SEED_OWNER_EMAIL || 'admin@maktaba.local').toLowerCase();
  const fullName = process.env.SEED_OWNER_NAME || 'المالك';
  const orgName = process.env.SEED_ORG_NAME || 'مركز المهندس للخدمات العلمية والطباعة';
  const slug = (process.env.SEED_ORG_SLUG || 'al-mohandes').toLowerCase();
  const phone = process.env.SEED_ORG_PHONE || '';

  const passwordHash = hashPassword(password);
  const org = await prisma.organization.create({
    data: { name: orgName, slug, phone },
  });
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      fullName,
      email,
      passwordHash,
      role: 'OWNER',
      permissions: JSON.stringify(ALL_PERMISSIONS),
      active: true,
    },
  });

  console.log('✓ تم المسح وإنشاء المالك (PBKDF2-SHA256)');
  console.log('  المكتبة: ' + org.name + ' (' + org.slug + ')');
  console.log('  البريد:  ' + user.email);
  console.log('  (كلمة المرور هي التي عيّنتها في SEED_OWNER_PASSWORD — لن تُطبع هنا)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
