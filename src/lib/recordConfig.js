// Record registry: drives list links, detail pages, edit permissions and
// activity lookups for every major entity. Entities without an entry here
// still open in a generic read-only detail view.
const F = (key, en, ar, type = 'text') => ({ key, en, ar, type });

export const humanize = (k) =>
  String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const RECORD_CONFIG = {
  Company: {
    listPath: '/companies',
    titleKey: 'nav_company_registry',
    title: (r) => r.company_name_en || r.company_name_ar || r.id,
    statusField: 'status',
    fields: [
      F('company_name_en', 'Company Name (English)', 'اسم الشركة (إنجليزي)'),
      F('company_name_ar', 'Company Name (Arabic)', 'اسم الشركة (عربي)'),
      F('commercial_registration_number', 'CR Number', 'رقم السجل التجاري'),
      F('business_license_number', 'Business License No.', 'رقم ترخيص العمل'),
      F('business_license_attachment', 'License Document', 'مستند الترخيص', 'file'),
      F('year_of_establishment', 'Year Established', 'سنة التأسيس'),
      F('company_type', 'Company Type', 'نوع الشركة'),
      F('business_sector', 'Business Sector', 'قطاع الأعمال'),
      F('capital', 'Capital', 'رأس المال', 'money'),
      F('auditor_name', 'Auditor', 'المدقق'),
      F('cofs_file_number', 'COFS File No.', 'رقم ملف COFS'),
      F('moci_registration_proof', 'MOCI Registration Proof', 'إثبات التسجيل', 'file'),
      F('official_email', 'Official Email', 'البريد الرسمي'),
      F('telephone', 'Telephone', 'الهاتف'),
      F('governorate', 'Governorate', 'المحافظة'),
      F('area', 'Area', 'المنطقة'),
      F('street', 'Street', 'الشارع'),
      F('building', 'Building', 'المبنى'),
      F('ceo_name_en', 'CEO Name', 'اسم الرئيس التنفيذي'),
      F('ceo_email', 'CEO Email', 'بريد الرئيس التنفيذي'),
      F('ceo_mobile', 'CEO Mobile', 'جوال الرئيس التنفيذي'),
      F('financial_manager_name', 'Financial Manager', 'المدير المالي'),
      F('financial_manager_email', 'Financial Mgr Email', 'بريد المدير المالي'),
      F('status', 'Status', 'الحالة', 'status'),
    ],
    editableFields: [
      'company_name_en', 'company_name_ar', 'cofs_file_number', 'commercial_registration_number', 'business_license_number', 'year_of_establishment',
      'company_type', 'business_sector', 'capital', 'auditor_name', 'official_email',
      'telephone', 'governorate', 'area', 'street', 'building', 'ceo_name_en', 'ceo_email',
      'ceo_mobile', 'financial_manager_name', 'financial_manager_email',
    ],
    canCreate: (u) => u?.role === 'system_admin',
    createFields: ['company_name_ar', 'company_name_en', 'commercial_registration_number', 'cofs_file_number', 'business_sector', 'capital', 'official_email', 'telephone'],
    canEdit: (u, r) => {
      if (!u) return false;
      const internal = ['contributions_manager', 'system_admin'].includes(u.role);
      const own = r.created_by_id === u.id || r.primary_user_id === u.id;
      if (u.role === 'company_representative') return own && !r.profile_locked;
      return internal;
    },
    canDelete: (u) => u?.role === 'system_admin',
  },

  ContributionApplication: {
    listPath: '/applications',
    titleKey: 'nav_applications',
    title: (r) => r.application_reference || r.company_name || r.id,
    statusField: 'status',
    fields: [
      F('application_reference', 'Reference', 'المرجع'),
      F('company_name', 'Company', 'الشركة'),
      F('financial_year', 'Financial Year', 'السنة المالية'),
      F('payment_method', 'Payment Method', 'طريقة الدفع'),
      F('additional_comments', 'Additional Comments', 'تعليقات إضافية', 'textarea'),
      F('assigned_officer_name', 'Assigned Officer', 'الموظف المسند'),
      F('submitted_date', 'Submitted Date', 'تاريخ الإرسال', 'datetime'),
      F('profile_confirmed', 'Profile Confirmed', 'تأكيد الملف'),
      F('current_step', 'Wizard Step', 'خطوة الإدخال'),
      F('status', 'Status', 'الحالة', 'status'),
    ],
    editableFields: ['financial_year', 'payment_method', 'additional_comments'],
    canEdit: (u, r) => {
      if (!u) return false;
      if (u.role === 'company_representative') {
        return r.created_by_id === u.id && ['draft', 'returned'].includes(r.status);
      }
      return ['contributions_officer', 'contributions_manager', 'system_admin'].includes(u.role);
    },
    canCreate: () => false,
    canDelete: (u, r) =>
      u?.role === 'system_admin' || (r.created_by_id === u.id && ['draft', 'returned'].includes(r.status)),
  },

  ContributionCalculation: {
    listPath: '/calculation-review',
    titleKey: 'nav_calculation_review',
    title: (r) => r.calculation_reference || r.id,
    statusField: 'status',
    fields: [
      F('calculation_reference', 'Reference', 'المرجع'),
      F('financial_year', 'Financial Year', 'السنة المالية'),
      F('financial_inputs', 'Calculation Inputs', 'مدخلات الحساب', 'textarea'),
      F('adjustments', 'Adjustments', 'التسويات', 'money'),
      F('calculation_basis', 'Calculation Basis', 'أساس الحساب'),
      F('calculated_contribution', 'Calculated Contribution', 'المساهمة المحسوبة', 'money'),
      F('previous_contribution', 'Previous Contribution', 'المساهمة السابقة', 'money'),
      F('outstanding_balance', 'Outstanding Balance', 'الرصيد المستحق', 'money'),
      F('officer_comments', 'Officer Comments', 'تعليقات الموظف', 'textarea'),
      F('approved_by', 'Approved By', 'اعتمدها'),
      F('approval_date', 'Approval Date', 'تاريخ الاعتماد', 'datetime'),
      F('status', 'Status', 'الحالة', 'status'),
    ],
    editableFields: ['adjustments', 'calculation_basis', 'officer_comments'],
    canEdit: (u) => ['contributions_officer', 'contributions_manager', 'system_admin'].includes(u?.role),
    canCreate: () => false,
    canDelete: (u) => u?.role === 'system_admin',
  },

  FinancialStatement: {
    listPath: '/financial-statements',
    titleKey: 'nav_financial_statements',
    title: (r) => r.document_name || r.financial_year || r.id,
    statusField: 'review_status',
    fields: [
      F('document_name', 'Document Name', 'اسم المستند'),
      F('document_type', 'Document Type', 'نوع المستند'),
      F('financial_year', 'Financial Year', 'السنة المالية'),
      F('statement_start_date', 'Period Start', 'بداية الفترة', 'date'),
      F('statement_end_date', 'Period End', 'نهاية الفترة', 'date'),
      F('file_url', 'Statement File', 'ملف القائمة', 'file'),
      F('upload_date', 'Uploaded', 'تاريخ الرفع', 'datetime'),
      F('review_status', 'Review Status', 'حالة المراجعة', 'status'),
    ],
    editableFields: ['financial_year', 'statement_start_date', 'statement_end_date', 'document_name', 'document_type'],
    canEdit: (u, r) =>
      u?.role === 'system_admin' ||
      ['contributions_officer', 'contributions_manager'].includes(u?.role) ||
      r.created_by_id === u.id,
    canCreate: () => false,
    canDelete: (u, r) => u?.role === 'system_admin' || r.created_by_id === u.id,
  },

  Payment: {
    listPath: '/payments',
    titleKey: 'nav_payments',
    title: (r) => r.payment_reference || r.id,
    statusField: 'payment_status',
    fields: [
      F('payment_reference', 'Reference', 'المرجع'),
      F('company_name', 'Company', 'الشركة'),
      F('application_id', 'Application', 'الطلب'),
      F('payment_method', 'Payment Method', 'طريقة الدفع'),
      F('payment_amount', 'Amount', 'المبلغ', 'money'),
      F('payment_date', 'Payment Date', 'تاريخ الدفع', 'date'),
      F('cheque_number', 'Cheque No.', 'رقم الشيك'),
      F('bank_name', 'Bank', 'البنك'),
      F('transfer_reference', 'Transfer Ref.', 'مرجع الحوالة'),
      F('deposit_reference', 'Deposit Ref.', 'مرجع الإيداع'),
      F('transaction_reference', 'Transaction Ref.', 'مرجع المعاملة'),
      F('payment_evidence_attachment', 'Payment Evidence', 'إثبات الدفع', 'file'),
      F('internal_notes', 'Internal Notes', 'ملاحظات داخلية', 'textarea'),
      F('verified_by', 'Verified By', 'أكدتها'),
      F('verified_date', 'Verified Date', 'تاريخ التأكيد', 'datetime'),
      F('payment_status', 'Status', 'الحالة', 'status'),
    ],
    editableFields: [
      'payment_method', 'payment_amount', 'payment_date', 'cheque_number', 'bank_name',
      'transfer_reference', 'deposit_reference', 'transaction_reference', 'internal_notes',
    ],
    canCreate: () => false,
    createFields: ['payment_amount', 'payment_method', 'payment_date', 'cheque_number', 'bank_name', 'transfer_reference', 'deposit_reference', 'internal_notes'],
    companyField: 'company_id',
    refField: 'payment_reference',
    refPrefix: 'PAY',
    canEdit: (u) => ['accounts_unit', 'contributions_manager', 'system_admin'].includes(u?.role),
    canDelete: (u) => u?.role === 'system_admin',
  },

  ReceiptVoucher: {
    listPath: '/receipt-vouchers',
    titleKey: 'nav_receipt_vouchers',
    title: (r) => r.voucher_number || r.voucher_reference || r.id,
    statusField: 'status',
    fields: [
      F('voucher_number', 'Voucher No.', 'رقم الإيصال'),
      F('voucher_reference', 'Reference', 'المرجع'),
      F('company_name', 'Company', 'الشركة'),
      F('application_id', 'Application', 'الطلب'),
      F('voucher_date', 'Voucher Date', 'تاريخ الإيصال', 'date'),
      F('status', 'Status', 'الحالة', 'status'),
    ],
    editableFields: ['voucher_date'],
    canCreate: () => false,
    createFields: ['voucher_date'],
    companyField: 'company_id',
    refField: 'voucher_number',
    refPrefix: 'RV',
    canEdit: (u) => ['accounts_unit', 'system_admin'].includes(u?.role),
    canDelete: (u) => u?.role === 'system_admin',
  },

  ClearanceLetter: {
    listPath: '/clearance-letters',
    titleKey: 'nav_clearance_letters',
    title: (r) => r.clearance_reference || r.id,
    statusField: 'clearance_status',
    fields: [
      F('clearance_reference', 'Reference', 'المرجع'),
      F('company_name', 'Company', 'الشركة'),
      F('application_id', 'Application', 'الطلب'),
      F('clearance_date', 'Clearance Date', 'تاريخ المخالصة', 'date'),
      F('validity_period', 'Validity Period', 'مدة الصلاحية'),
      F('clearance_status', 'Status', 'الحالة', 'status'),
    ],
    editableFields: ['clearance_date', 'validity_period'],
    canCreate: () => false,
    createFields: ['clearance_date', 'validity_period'],
    companyField: 'company_id',
    refField: 'clearance_reference',
    refPrefix: 'CL',
    canEdit: (u) => ['accounts_unit', 'system_admin'].includes(u?.role),
    canDelete: (u) => u?.role === 'system_admin',
  },

  Inquiry: {
    listPath: '/inquiries',
    titleKey: 'nav_inquiries',
    title: (r) => r.subject || r.inquiry_reference || r.id,
    statusField: 'status',
    fields: [
      F('inquiry_reference', 'Reference', 'المرجع'),
      F('company_name', 'Company', 'الشركة'),
      F('inquiry_category', 'Category', 'الفئة'),
      F('subject', 'Subject', 'الموضوع'),
      F('description', 'Description', 'الوصف', 'textarea'),
      F('attachment', 'Attachment', 'المرفق', 'file'),
      F('submission_date', 'Submitted', 'تاريخ الإرسال', 'datetime'),
      F('assigned_officer_name', 'Assigned Officer', 'الموظف المسند'),
      F('response', 'Response', 'الرد', 'textarea'),
      F('response_date', 'Response Date', 'تاريخ الرد', 'datetime'),
      F('status', 'Status', 'الحالة', 'status'),
    ],
    editableFields: ['subject', 'description', 'response'],
    canCreate: (u) => !!u,
    createFields: ['inquiry_category', 'subject', 'description'],
    companyField: 'company_id',
    canEdit: (u, r) =>
      u?.role === 'system_admin' ||
      ['contributions_officer', 'contributions_manager'].includes(u?.role) ||
      (r.created_by_id === u.id && ['open', 'under_review'].includes(r.status)),
    canDelete: (u, r) => u?.role === 'system_admin' || r.created_by_id === u.id,
  },

  CommunicationThread: {
    listPath: '/inbox',
    titleKey: 'nav_inbox',
    title: (r) => r.subject || r.thread_reference || r.id,
    statusField: 'status',
    fields: [
      F('thread_reference', 'Reference', 'المرجع'),
      F('subject', 'Subject', 'الموضوع'),
      F('company_name', 'Company', 'الشركة'),
      F('assigned_officer_name', 'Assigned Officer', 'الموظف المسند'),
      F('participants', 'Participants', 'المشاركون'),
      F('last_activity', 'Last Activity', 'آخر نشاط', 'datetime'),
      F('status', 'Status', 'الحالة', 'status'),
    ],
    editableFields: ['subject'],
    canEdit: (u) => ['contributions_officer', 'contributions_manager', 'system_admin'].includes(u?.role),
    canDelete: (u) => u?.role === 'system_admin',
  },

  SubsidiaryDeclaration: {
    listPath: '/applications',
    titleKey: 'nav_applications',
    title: (r) => r.subsidiary_name || r.id,
    statusField: null,
    fields: [
      F('subsidiary_name', 'Subsidiary Name', 'اسم الشركة التابعة'),
      F('ownership_percentage', 'Ownership %', 'نسبة الملكية %'),
      F('financial_year', 'Financial Year', 'السنة المالية'),
      F('financial_statement_end_date', 'Statement End', 'نهاية القائمة', 'date'),
      F('income_statement_page', 'Income Statement Page', 'صفحة قائمة الدخل'),
      F('supporting_document', 'Supporting Document', 'مستند داعم', 'file'),
    ],
    editableFields: ['subsidiary_name', 'ownership_percentage', 'financial_year', 'income_statement_page'],
    canEdit: (u, r) => u?.role === 'system_admin' || r.created_by_id === u.id ||
      ['contributions_officer', 'contributions_manager'].includes(u?.role),
    canDelete: (u, r) => u?.role === 'system_admin' || r.created_by_id === u.id,
  },

  OfficerAssignment: {
    listPath: '/officer-workload',
    titleKey: 'nav_officer_workload',
    title: (r) => r.application_reference || r.id,
    statusField: null,
    fields: [
      F('application_reference', 'Application', 'الطلب'),
      F('previous_officer_name', 'Previous Officer', 'الموظف السابق'),
      F('new_officer_name', 'New Officer', 'الموظف الجديد'),
      F('assigned_by', 'Assigned By', 'أسندتها'),
      F('assignment_date', 'Assignment Date', 'تاريخ الإسناد', 'datetime'),
      F('assignment_reason', 'Reason', 'السبب'),
      F('notes', 'Notes', 'ملاحظات', 'textarea'),
    ],
    editableFields: ['notes'],
    canEdit: (u) => ['contributions_manager', 'system_admin'].includes(u?.role),
    canDelete: (u) => u?.role === 'system_admin',
  },

  Notification: {
    listPath: '/notifications',
    titleKey: 'nav_notifications',
    title: (r) => r.title || r.id,
    statusField: null,
    fields: [
      F('title', 'Title', 'العنوان'),
      F('category', 'Category', 'الفئة'),
      F('body', 'Body', 'النص', 'textarea'),
      F('is_read', 'Read', 'مقروء'),
      F('created_date', 'Created', 'تاريخ الإنشاء', 'datetime'),
    ],
    editableFields: ['is_read'],
    canEdit: (u, r) => r.user_id === u?.id || u?.role === 'system_admin',
    canDelete: (u, r) => r.user_id === u?.id || u?.role === 'system_admin',
  },
};

export const getRecordConfig = (entityName) => RECORD_CONFIG[entityName] || null;