# نظام إدارة العملاء العقاريين

تطبيق عربي احترافي لإدارة عملاء التسويق العقاري يعمل بحسابات مستخدمين وقاعدة بيانات Supabase. يحفظ بيانات الملاك والعقارات، العملاء الطالبين للشراء أو الإيجار، والمواعيد والمعاينات مع كشف تعارض التوقيتات.

## المميزات الرئيسية

### 📊 لوحة التحكم (Dashboard)
- إحصائيات فورية: عقارات، عملاء، مواعيد، مهام
- جدول يومي للمواعيد
- تنبيهات للمواعيد المتأخرة والتعارضات
- قائمة المهام العاجلة

### 🏠 قسم الملاك والعقارات
- نموذج منظم بـ 3 Tabs: بيانات أساسية / تفاصيل / وسائط
- رفع صور وفيديوهات للعقار
- تحميل كل الوسائط كـ ZIP
- تفاصيل كاملة مع خريطة وجولة افتراضية

### 👥 قسم العملاء الطالبين
- نظام Pipeline (Kanban) لمراحل المتابعة
- تغيير سريع للحالة
- ربط تلقائي بالمواعيد

### 📅 قسم المواعيد والمعاينات
- كشف تلقائي لتعارض التوقيتات
- تنبيهات صوتية وإشعارات
- ربط بالعميل المسجل

### ✅ نظام المهام (Tasks)
- إضافة مهام مرتبطة بعقار/عميل/موعد
- أولويات (عالية/متوسطة/منخفضة)
- شارة "متأخرة" للمهام المُتجاوزة

### 🤖 الذكاء الاصطناعي
- تعبئة تلقائية للنماذج من النصوص
- تحليل صور العقارات
- بحث ذكي داخل البيانات
- دعم Gemini و OpenRouter

### 🌙 Dark Mode
- وضع داكن كامل مع تبديل سهل
- يحفظ التفضيل تلقائياً

## التشغيل المحلي

```bash
npm install
npm run dev
```

انسخ ملف `.env.example` إلى `.env.local` وضع بيانات Supabase:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## إعداد Supabase

### 1. إنشاء الجداول

شغّل ملف `supabase/migrations/001_initial_schema.sql` في SQL Editor:

```bash
supabase login --token your-access-token
supabase link --project-ref your-project-ref
supabase db push
```

### 2. إنشاء Storage Bucket

- اذهب إلى Storage في لوحة التحكم
- أنشئ Bucket باسم `property-media`
- اجعله **public**

## الفحص والبناء

```bash
npm run lint
npm run build
```

## النشر

### GitHub Pages
```powershell
$env:VITE_BASE_PATH='/real-estate-crm-ar/'
npm run build
```

### Supabase (Live)
- المشروع: https://mlrmzdyvzbclbkdyiwge.supabase.co
- الجداول: property_owners, demand_clients, appointments, property_media
- Storage: property-media (public)

## التحديثات الأخيرة

- ✅ Toast Notifications
- ✅ Confirm Dialog احترافي
- ✅ Dark Mode
- ✅ نظام المهام
- ✅ Tabs لنموذج العقار
- ✅ تحسينات Dashboard
- ✅ Animations و Skeleton Loading
