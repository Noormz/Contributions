// Company profile field groups: [key, en, ar, type?, opts?]
// type: text | email | tel | number | money | bool | file | status | lookup:<category>
// internalOnly: only internal users may edit.
export const PROFILE_GROUPS = [
  {
    key: 'company', en: 'Company information', ar: 'بيانات الشركة', fields: [
      ['company_name_ar', 'Company name (Arabic)', 'اسم الشركة (عربي)', 'text', { required: true, dir: 'rtl' }],
      ['company_name_en', 'Company name (English)', 'اسم الشركة (إنجليزي)', 'text', { required: true }],
      ['previous_company_name', 'Previous name', 'الاسم السابق'],
      ['commercial_registration_number', 'CR number', 'رقم السجل التجاري', 'text', { internalOnly: true }],
      ['cofs_file_number', 'COFS file no.', 'رقم ملف COFS', 'text', { internalOnly: true }],
      ['business_license_number', 'Business licence no.', 'رقم الترخيص التجاري'],
      ['year_of_establishment', 'Year established', 'سنة التأسيس', 'number'],
      ['company_type', 'Company type', 'نوع الشركة', 'lookup:company_type'],
      ['business_sector', 'Business sector', 'قطاع الأعمال', 'lookup:business_sector'],
      ['is_wll', 'W.L.L.', 'ذات مسؤولية محدودة', 'bool'],
      ['capital', 'Capital', 'رأس المال', 'money'],
      ['auditor_name', 'Auditor', 'مدقق الحسابات'],
      ['status', 'Registration status', 'حالة التسجيل', 'status', { internalOnly: true }],
      ['business_license_attachment', 'Business licence document', 'مستند الترخيص', 'file'],
      ['moci_registration_proof', 'MOCI registration proof', 'إثبات التسجيل في وزارة التجارة', 'file'],
    ],
  },
  {
    key: 'address', en: 'Address and contact', ar: 'العنوان والاتصال', fields: [
      ['governorate', 'Governorate', 'المحافظة', 'lookup:governorate'],
      ['area', 'Area', 'المنطقة'], ['street', 'Street', 'الشارع'], ['building', 'Building', 'المبنى'],
      ['floor', 'Floor', 'الطابق'], ['office', 'Office', 'المكتب'], ['postal_address', 'P.O. Box', 'صندوق البريد'],
      ['postal_code', 'Postal code', 'الرمز البريدي'], ['telephone', 'Telephone', 'الهاتف', 'tel'],
      ['official_email', 'Official email', 'البريد الرسمي', 'email'],
    ],
  },
  {
    key: 'ceo', en: 'Chief Executive Officer', ar: 'الرئيس التنفيذي', fields: [
      ['ceo_name_en', 'Name (English)', 'الاسم (إنجليزي)'], ['ceo_name_ar', 'Name (Arabic)', 'الاسم (عربي)', 'text', { dir: 'rtl' }],
      ['ceo_job_title', 'Job title', 'المسمى الوظيفي'], ['ceo_email', 'Email', 'البريد الإلكتروني', 'email'],
      ['ceo_telephone', 'Telephone', 'الهاتف', 'tel'], ['ceo_mobile', 'Mobile', 'الجوال', 'tel'],
    ],
  },
  {
    key: 'finance', en: 'Financial manager / accountant', ar: 'المدير المالي / المحاسب', fields: [
      ['financial_manager_name', 'Name', 'الاسم'], ['financial_manager_position', 'Position', 'المنصب'],
      ['financial_manager_email', 'Email', 'البريد الإلكتروني', 'email'], ['financial_manager_telephone', 'Telephone', 'الهاتف', 'tel'],
      ['financial_manager_mobile', 'Mobile', 'الجوال', 'tel'],
    ],
  },
];

export const COMPANY_STATUSES = ['pending', 'active', 'suspended', 'rejected'];
