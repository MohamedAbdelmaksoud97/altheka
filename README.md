# منصة العمليات القانونية

تطبيق عربي RTL مبني بـNext.js 16 وSupabase لإدارة التسجيل والصلاحيات والمشاريع وسير العمل والمستندات القانونية.

## الإعداد المحلي

1. انسخ قيم `.env.example` إلى `.env.local` وأدخل مفاتيح مشروع التطوير.
2. استخدم `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` للمفتاح العام. لا تضع Service Role أو SMTP أو `DATABASE_URL` في متغير يبدأ بـ`NEXT_PUBLIC_`.
3. ثبّت الحزم وشغّل التطبيق:

```powershell
npm install
npm run dev
```

يفتح التطبيق على [http://localhost:3000](http://localhost:3000).

إذا كانت مفاتيح Auth العامة غير موجودة، يعرض التطبيق شاشة إعداد بدل تشغيل التسجيل ببيانات ناقصة.

## قاعدة البيانات

توجد المهاجرات في `supabase/migrations`. لتطبيقها على بيئة جديدة:

```powershell
npx supabase db push --db-url $env:DATABASE_URL --include-all
```

بعد كل تغيير في المخطط:

```powershell
npx supabase db advisors --db-url $env:DATABASE_URL --type security --level warn
npx supabase db advisors --db-url $env:DATABASE_URL --type performance --level warn
```

## أول مدير نظام

حدد `INITIAL_SUPER_ADMIN_EMAIL` و`SUPABASE_SERVICE_ROLE_KEY` ثم شغّل:

```powershell
npm run bootstrap:admin
```

السكربت Idempotent. إذا لم يكن المستخدم موجودًا، سجله من صفحة الموظفين ثم أعد التشغيل، أو استخدم `INITIAL_SUPER_ADMIN_PASSWORD` لمرة واحدة واحذفه فورًا بعدها.

## التحقق

```powershell
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit
```

قرارات المشروع وافتراضاته الحالية موثقة في [`docs/assumptions.md`](docs/assumptions.md).
