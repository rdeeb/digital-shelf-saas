import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.plan.upsert({
    where: { id: 'plan_basic' },
    create: {
      id: 'plan_basic',
      name: 'Basic',
      deviceLimit: 1,
      paypalPlanIdMonthly: process.env.PAYPAL_BASIC_MONTHLY_PLAN_ID ?? 'paypal_basic_monthly',
      paypalPlanIdAnnual: process.env.PAYPAL_BASIC_ANNUAL_PLAN_ID ?? 'paypal_basic_annual',
      appleProductIdMonthly:
        process.env.APPLE_BASIC_MONTHLY_PRODUCT_ID ?? 'com.digitalshelf.basic.monthly',
      appleProductIdAnnual:
        process.env.APPLE_BASIC_ANNUAL_PRODUCT_ID ?? 'com.digitalshelf.basic.annual',
      googleProductIdMonthly: process.env.GOOGLE_BASIC_MONTHLY_PRODUCT_ID ?? 'basic_monthly',
      googleProductIdAnnual: process.env.GOOGLE_BASIC_ANNUAL_PRODUCT_ID ?? 'basic_annual',
    },
    update: {},
  });

  await prisma.plan.upsert({
    where: { id: 'plan_pro' },
    create: {
      id: 'plan_pro',
      name: 'Pro',
      deviceLimit: null,
      paypalPlanIdMonthly: process.env.PAYPAL_PRO_MONTHLY_PLAN_ID ?? 'paypal_pro_monthly',
      paypalPlanIdAnnual: process.env.PAYPAL_PRO_ANNUAL_PLAN_ID ?? 'paypal_pro_annual',
      appleProductIdMonthly:
        process.env.APPLE_PRO_MONTHLY_PRODUCT_ID ?? 'com.digitalshelf.pro.monthly',
      appleProductIdAnnual: process.env.APPLE_PRO_ANNUAL_PRODUCT_ID ?? 'com.digitalshelf.pro.annual',
      googleProductIdMonthly: process.env.GOOGLE_PRO_MONTHLY_PRODUCT_ID ?? 'pro_monthly',
      googleProductIdAnnual: process.env.GOOGLE_PRO_ANNUAL_PRODUCT_ID ?? 'pro_annual',
    },
    update: {},
  });

  await prisma.platformSetting.upsert({
    where: { key: 'sales.new_enabled' },
    create: { key: 'sales.new_enabled', value: 'true' },
    update: {},
  });

  await prisma.platformSetting.upsert({
    where: { key: 'sales.renewals_enabled' },
    create: { key: 'sales.renewals_enabled', value: 'true' },
    update: {},
  });

  await prisma.platformSetting.upsert({
    where: { key: 'sales.stop_message' },
    create: { key: 'sales.stop_message', value: '' },
    update: {},
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
