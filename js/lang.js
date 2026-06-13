// ============================================================
// HIS — Language Module (Arabic + English)
// ============================================================

const LANG = {
  // ---- Patient Portal ----
  pp_overview:           { ar: 'الرئيسية',              en: 'Home' },
  pp_visits:             { ar: 'زياراتي',                en: 'My Visits' },
  pp_labs:               { ar: 'خطتي العلاجية',          en: 'Treatment Plan' },
  pp_prescriptions:      { ar: 'أدويتي',                en: 'My Medications' },
  pp_appointments:       { ar: 'مواعيدي',               en: 'My Appointments' },
  pp_messages:           { ar: 'رسائلي',                en: 'Messages' },
  patient_login_required:{ ar: 'يتطلب تسجيل دخول المريض', en: 'Patient login required' },
  patient_login_error:   { ar: 'الرقم الطبي أو تاريخ الميلاد غير صحيح', en: 'Invalid Medical Record Number or Date of Birth' },
  login_locked:          { ar: 'الحساب مقفل بسبب محاولات فاشلة متعددة. أعد المحاولة بعد قليل.', en: 'Account temporarily locked due to repeated failed attempts. Try again shortly.' },
  patient_portal_disabled:{ar: 'بوابة المرضى معطلة لهذا الحساب', en: 'Patient portal is disabled for this account' },
  // ---- Smart Phrases ----
  // ---- Analytics ----
  hm_analytics:          { ar: 'لوحة التحليلات', en: 'Analytics Dashboard' },
  analytics_period_7d:   { ar: 'آخر 7 أيام', en: 'Last 7 days' },
  analytics_period_30d:  { ar: 'آخر 30 يوم', en: 'Last 30 days' },
  analytics_period_90d:  { ar: 'آخر 90 يوم', en: 'Last 90 days' },
  analytics_census:      { ar: 'إشغال الأسرّة عبر الزمن', en: 'Census Over Time' },
  analytics_dept_occ:    { ar: 'إشغال الأقسام', en: 'Department Occupancy' },
  analytics_los:         { ar: 'متوسط مدة الإقامة', en: 'Avg Length of Stay (days)' },
  analytics_readmit:     { ar: 'توزيع مخاطر إعادة الإدخال', en: 'Readmission Risk Distribution' },
  analytics_critical_labs:{ar: 'النتائج المختبرية الحرجة', en: 'Critical Lab Results' },
  analytics_sepsis:      { ar: 'تنبيهات الإنتان', en: 'Sepsis Alerts' },
  analytics_rx_verify:   { ar: 'متوسط زمن التحقق من الأدوية', en: 'Avg Rx Verification Time' },
  analytics_top_diag:    { ar: 'أكثر التشخيصات شيوعاً', en: 'Top Diagnoses' },
  // ---- Auto-dose ----
  autodose_weight:       { ar: 'الوزن (كجم)',           en: 'Weight (kg)' },
  autodose_egfr:         { ar: 'معدل الترشيح الكبيبي',   en: 'eGFR (mL/min)' },
  // ---- Sepsis Alert ----
  // ---- NANDA/NIC/NOC ----
  care_plan_title:       { ar: 'خطة الرعاية التمريضية',  en: 'Nursing Care Plan' },
  nanda_label:           { ar: 'التشخيص (NANDA)',       en: 'Diagnosis (NANDA)' },
  nic_label:             { ar: 'التدخلات (NIC)',        en: 'Interventions (NIC)' },
  noc_label:             { ar: 'النتائج (NOC)',         en: 'Outcomes (NOC)' },
  care_plan_goal:        { ar: 'الهدف العلاجي',         en: 'Treatment Goal' },
  add_care_plan:         { ar: '+ إضافة خطة رعاية',     en: '+ Add Care Plan' },
  // ---- Readmission Risk ----

  // ---- Login Screen ----
  username_label:   { ar: 'اسم المستخدم', en: 'Username' },
  password_label:   { ar: 'كلمة المرور', en: 'Password' },
  show_password:    { ar: 'إظهار', en: 'Show' },
  hide_password:    { ar: 'إخفاء', en: 'Hide' },
  role_label:       { ar: 'الدور الوظيفي', en: 'Role' },
  login_btn:        { ar: 'دخول', en: 'Login' },
  logging_in:       { ar: 'جاري الدخول...', en: 'Logging in...' },
  select_role:      { ar: 'اختر الدور الوظيفي', en: 'Select your role' },
  login_error_cred: { ar: 'اسم المستخدم أو كلمة المرور غلط', en: 'Incorrect username or password' },
  login_error_disabled: { ar: 'هذا الحساب معطل. تواصل مع مدير النظام.', en: 'This account is disabled. Contact your IT administrator.' },
  logout_btn:       { ar: 'تسجيل الخروج', en: 'Logout' },
  logout_confirm:   { ar: 'هل تريد تسجيل الخروج؟', en: 'Are you sure you want to logout?' },

  // ---- Roles ----

  // ---- Departments ----

  // ---- Common Actions ----
  save_btn:          { ar: 'حفظ', en: 'Save' },
  cancel_btn:        { ar: 'إلغاء', en: 'Cancel' },
  edit_btn:          { ar: 'تعديل', en: 'Edit' },
  disable_btn:       { ar: 'تعطيل', en: 'Disable' },
  enable_btn:        { ar: 'تفعيل', en: 'Enable' },
  search_btn:        { ar: 'بحث', en: 'Search' },
  filter_btn:        { ar: 'تصفية', en: 'Filter' },
  clear_btn:         { ar: 'مسح', en: 'Clear' },
  confirm_btn:       { ar: 'تأكيد', en: 'Confirm' },
  back_btn:          { ar: 'رجوع', en: 'Back' },
  close_btn:         { ar: 'إغلاق', en: 'Close' },
  submit_btn:        { ar: 'إرسال', en: 'Submit' },
  loading:           { ar: 'جاري التحميل...', en: 'Loading...' },
  no_data:           { ar: 'لا توجد بيانات', en: 'No data available' },
  actions:           { ar: 'إجراءات', en: 'Actions' },
  status:            { ar: 'الحالة', en: 'Status' },
  active:            { ar: 'فعال', en: 'Active' },
  inactive:          { ar: 'معطل', en: 'Inactive' },
  details:           { ar: 'تفاصيل', en: 'Details' },
  notes:             { ar: 'ملاحظات', en: 'Notes' },
  date:              { ar: 'التاريخ', en: 'Date' },
  time:              { ar: 'الوقت', en: 'Time' },

  // ---- Success / Error Messages ----
  success_saved:     { ar: 'تم الحفظ بنجاح', en: 'Saved successfully' },
  success_updated:   { ar: 'تم التحديث بنجاح', en: 'Updated successfully' },
  success_login:     { ar: 'تم تسجيل الدخول بنجاح', en: 'Login successful' },
  error_generic:     { ar: 'حدث خطأ. حاول مرة أخرى.', en: 'An error occurred. Please try again.' },
  error_required:    { ar: 'يرجى ملء جميع الحقول المطلوبة', en: 'Please fill in all required fields' },

  // ---- IT Admin ----
  user_management:   { ar: 'إدارة المستخدمين', en: 'User Management' },
  dept_setup:        { ar: 'إعداد الأقسام', en: 'Department Setup' },
  // ---- OpenSmile dental nav ----
  specialty_setup:     { ar: 'إعداد التخصصات والكراسي', en: 'Specialties & Chairs' },
  odontogram_nav:      { ar: 'مخطط الأسنان', en: 'Odontogram' },
  treatment_plans_nav: { ar: 'الخطط العلاجية', en: 'Treatment Plans' },
  intake_nav:          { ar: 'التاريخ الطبي', en: 'Medical History' },
  perio_nav:           { ar: 'مخطط اللثة', en: 'Perio Chart' },
  system_settings:   { ar: 'إعدادات النظام', en: 'System Settings' },
  add_user:          { ar: 'إضافة مستخدم جديد', en: 'Add New User' },
  edit_user:         { ar: 'تعديل المستخدم', en: 'Edit User' },
  total_users:       { ar: 'إجمالي المستخدمين', en: 'Total Users' },
  active_sessions:   { ar: 'الجلسات النشطة', en: 'Active Sessions' },
  full_name_ar:      { ar: 'الاسم الكامل (عربي)', en: 'Full Name (Arabic)' },
  full_name_en:      { ar: 'الاسم الكامل (إنجليزي)', en: 'Full Name (English)' },
  department:        { ar: 'القسم', en: 'Department' },
  specialization:    { ar: 'التخصص', en: 'Specialization' },
  password_new:      { ar: 'كلمة المرور', en: 'Password' },
  password_confirm:  { ar: 'تأكيد كلمة المرور', en: 'Confirm Password' },
  password_mismatch: { ar: 'كلمتا المرور غير متطابقتين', en: 'Passwords do not match' },
  password_min:      { ar: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل', en: 'Password must be at least 8 characters' },
  confirm_disable_user: { ar: 'هل أنت متأكد من تعطيل حساب {name}؟ لن يتمكن من تسجيل الدخول.', en: 'Are you sure you want to disable {name}\'s account? They will not be able to log in.' },
  confirm_enable_user:  { ar: 'هل أنت متأكد من تفعيل حساب {name}؟', en: 'Are you sure you want to enable {name}\'s account?' },
  user_created_success: { ar: 'تم إنشاء حساب {name} بنجاح', en: 'Account for {name} created successfully' },
  user_updated_success: { ar: 'تم تحديث حساب {name} بنجاح', en: 'Account for {name} updated successfully' },
  username_taken:    { ar: 'اسم المستخدم مستخدم مسبقاً', en: 'Username is already taken' },
  not_authorized:    { ar: 'غير مصرّح لك بهذا الإجراء', en: 'You are not authorized to perform this action' },

  // ---- Hospital Manager ----
  overview:          { ar: 'نظرة عامة', en: 'Overview' },
  blackbox_viewer:   { ar: 'سجل المراجعة (الصندوق الأسود)', en: 'Blackbox Audit Log' },
  reports:           { ar: 'التقارير', en: 'Reports' },
  total_admitted:    { ar: 'إجمالي المرضى المنومين', en: 'Total Admitted Patients' },
  active_staff:      { ar: 'الموظفين النشطين', en: 'Active Staff' },
  alerts_count:      { ar: 'التنبيهات', en: 'Alerts' },
  filter_by_date:    { ar: 'تصفية بالتاريخ', en: 'Filter by Date' },
  filter_by_user:    { ar: 'تصفية بالمستخدم', en: 'Filter by User' },
  filter_by_dept:    { ar: 'تصفية بالقسم', en: 'Filter by Department' },
  filter_by_action:  { ar: 'تصفية بنوع الإجراء', en: 'Filter by Action Type' },
  timestamp_col:     { ar: 'الوقت', en: 'Timestamp' },
  user_col:          { ar: 'المستخدم', en: 'User' },
  role_col:          { ar: 'الدور', en: 'Role' },
  dept_col:          { ar: 'القسم', en: 'Department' },
  patient_col:       { ar: 'المريض', en: 'Patient' },
  action_col:        { ar: 'الإجراء', en: 'Action' },

  // ---- Emergency Doctor ----
  register_patient:     { ar: 'تسجيل مريض جديد', en: 'Register New Patient' },
  active_cases:         { ar: 'الحالات النشطة', en: 'Active Cases' },
  patient_info:         { ar: 'بيانات المريض', en: 'Patient Information' },
  national_id:          { ar: 'رقم الهوية الوطنية', en: 'National ID' },
  patient_name_ar:      { ar: 'اسم المريض (عربي)', en: 'Patient Name (Arabic)' },
  patient_name_en:      { ar: 'اسم المريض (إنجليزي)', en: 'Patient Name (English)' },
  date_of_birth:        { ar: 'تاريخ الميلاد', en: 'Date of Birth' },
  gender:               { ar: 'الجنس', en: 'Gender' },
  male:                 { ar: 'ذكر', en: 'Male' },
  female:               { ar: 'أنثى', en: 'Female' },
  blood_type:           { ar: 'فصيلة الدم', en: 'Blood Type' },
  blood_unknown:        { ar: 'غير معروف', en: 'Unknown' },
  phone:                { ar: 'رقم الهاتف', en: 'Phone Number' },
  emergency_contact:    { ar: 'جهة اتصال الطوارئ', en: 'Emergency Contact' },
  chief_complaint:      { ar: 'الشكوى الرئيسية', en: 'Chief Complaint' },
  initial_diagnosis:    { ar: 'التشخيص المبدئي', en: 'Initial Diagnosis' },
  triage_level:         { ar: 'مستوى الفرز', en: 'Triage Level' },
  admit_to:             { ar: 'نقل إلى قسم', en: 'Admit to Department' },
  bed_number:           { ar: 'رقم السرير', en: 'Bed Number' },
  conditions:           { ar: 'الحالات المرضية', en: 'Medical Conditions' },
  allergies:            { ar: 'الحساسية', en: 'Allergies' },
  allergen:             { ar: 'المادة المسببة', en: 'Allergen' },
  reaction:             { ar: 'نوع التفاعل', en: 'Reaction Type' },
  severity:             { ar: 'الشدة', en: 'Severity' },
  on_ventilator:        { ar: 'على جهاز التنفس الصناعي', en: 'On Ventilator' },
  post_surgery:         { ar: 'بعد عملية جراحية', en: 'Post-Surgery' },
  mrn:                  { ar: 'رقم الملف الطبي', en: 'Medical Record Number (MRN)' },
  disposition_plan:     { ar: 'خطة التصرف', en: 'Disposition Plan' },
  register_btn:         { ar: 'تسجيل المريض', en: 'Register Patient' },
  patient_registered:   { ar: 'تم تسجيل المريض بنجاح', en: 'Patient registered successfully' },

  // ---- Conditions ----

  // ---- Severity ----
  sev_mild:             { ar: 'خفيفة', en: 'Mild' },
  sev_moderate:         { ar: 'متوسطة', en: 'Moderate' },
  sev_severe:           { ar: 'شديدة', en: 'Severe' },

  // ---- Problem list (ICD-10 coded) + patient flags ----
  problem_list:      { ar: 'قائمة المشاكل', en: 'Problem List' },
  pl_active_problems:{ ar: 'المشاكل النشطة', en: 'Active Problems' },
  pl_problem:        { ar: 'المشكلة', en: 'Problem' },
  pl_severity:       { ar: 'الشدة', en: 'Severity' },
  pl_onset:          { ar: 'تاريخ البدء', en: 'Onset' },
  pl_resolve:        { ar: 'حلّ', en: 'Resolve' },
  pl_no_problems:    { ar: 'لا توجد مشاكل نشطة', en: 'No active problems' },
  pl_add_problem:    { ar: 'إضافة مشكلة', en: 'Add Problem' },
  pl_search_icd:     { ar: 'ابحث برمز ICD-10 أو الاسم…', en: 'Search ICD-10 code or name…' },
  pl_add_btn:        { ar: 'إضافة', en: 'Add' },
  pl_resolved:       { ar: 'المشاكل المُحَلّة', en: 'Resolved Problems' },
  pl_resolved_on:    { ar: 'تاريخ الحل', en: 'Resolved On' },
  pl_flags:          { ar: 'علامات المريض', en: 'Patient Flags' },
  pl_no_flags:       { ar: 'لا توجد علامات', en: 'No flags' },
  pl_flag_label:     { ar: 'نص العلامة (إنجليزي)', en: 'Flag label (English)' },
  pl_flag_label_ar:  { ar: 'نص العلامة (عربي)', en: 'Flag label (Arabic)' },
  pl_flag_color:     { ar: 'اللون', en: 'Color' },
  pl_color_info:     { ar: 'معلومة (أزرق)', en: 'Info (blue)' },
  pl_color_warn:     { ar: 'تحذير (برتقالي)', en: 'Warning (amber)' },
  pl_color_danger:   { ar: 'خطر (أحمر)', en: 'Danger (red)' },
  pl_add_flag:       { ar: 'إضافة علامة', en: 'Add Flag' },
  pl_flag_remove:    { ar: 'إزالة العلامة', en: 'Remove flag' },
  problem_added:     { ar: 'أُضيفت المشكلة', en: 'Problem added' },
  problem_resolved:  { ar: 'تم حل المشكلة', en: 'Problem resolved' },
  flag_added:        { ar: 'أُضيفت العلامة', en: 'Flag added' },
  flag_removed:      { ar: 'أُزيلت العلامة', en: 'Flag removed' },

  // ---- Patient-safety incident reporting ----
  incident_report_nav:   { ar: 'بلاغ حادثة', en: 'Report Incident' },
  incident_queue_nav:    { ar: 'قائمة الحوادث', en: 'Incident Queue' },
  incident_report_title: { ar: 'بلاغ حادثة سلامة المريض', en: 'Patient-Safety Incident Report' },
  incident_report_intro: { ar: 'سجّل حادثة أو ما كاد يحدث. هذا منفصل عن سجل التدقيق ويُراجع من قبل الإدارة.', en: 'Report an incident or near-miss. This is separate from the audit log and is reviewed by management.' },
  incident_queue_title:  { ar: 'حوادث السلامة', en: 'Safety Incidents' },
  inc_type:              { ar: 'النوع', en: 'Type' },
  inc_severity:          { ar: 'الشدة', en: 'Severity' },
  inc_occurred_at:       { ar: 'وقت الحدوث', en: 'Occurred at' },
  inc_location:          { ar: 'الموقع', en: 'Location' },
  inc_patient:           { ar: 'المريض (اختياري)', en: 'Patient (optional)' },
  inc_no_patient:        { ar: '— لا يوجد مريض محدد —', en: '— no specific patient —' },
  inc_description:       { ar: 'الوصف', en: 'Description' },
  inc_immediate_action:  { ar: 'الإجراء الفوري', en: 'Immediate action taken' },
  inc_anonymous_opt:     { ar: 'إبلاغ مجهول (إخفاء اسمي عن المراجعين)', en: 'Report anonymously (hide my name from reviewers)' },
  inc_submit:            { ar: 'إرسال البلاغ', en: 'Submit report' },
  inc_type_fall:             { ar: 'سقوط', en: 'Fall' },
  inc_type_medication:       { ar: 'خطأ دوائي', en: 'Medication error' },
  inc_type_near_miss:        { ar: 'حادث وشيك', en: 'Near miss' },
  inc_type_equipment:        { ar: 'عطل في الأجهزة', en: 'Equipment' },
  inc_type_pressure_injury:  { ar: 'قرحة فراش', en: 'Pressure injury' },
  inc_type_other:            { ar: 'أخرى', en: 'Other' },
  inc_sev_no_harm:   { ar: 'بلا ضرر', en: 'No harm' },
  inc_sev_low:       { ar: 'منخفض', en: 'Low' },
  inc_sev_moderate:  { ar: 'متوسط', en: 'Moderate' },
  inc_sev_severe:    { ar: 'شديد', en: 'Severe' },
  inc_sev_sentinel:  { ar: 'حدث جسيم', en: 'Sentinel' },
  inc_status_open:         { ar: 'مفتوح', en: 'Open' },
  inc_status_under_review: { ar: 'قيد المراجعة', en: 'Under review' },
  inc_status_closed:       { ar: 'مغلق', en: 'Closed' },
  inc_status_all:          { ar: 'الكل', en: 'All' },
  inc_filter_status: { ar: 'تصفية حسب الحالة', en: 'Filter by status' },
  inc_reporter:      { ar: 'المُبلِّغ', en: 'Reporter' },
  inc_anonymous:     { ar: 'مجهول', en: 'Anonymous' },
  inc_none:          { ar: 'لا توجد حوادث', en: 'No incidents' },
  inc_start_review:  { ar: 'بدء المراجعة', en: 'Start review' },
  inc_review_notes:  { ar: 'ملاحظات المراجعة', en: 'Review notes' },
  inc_close:         { ar: 'إغلاق', en: 'Close' },
  inc_closed:        { ar: 'مغلق', en: 'Closed' },
  inc_filed:         { ar: 'تم تسجيل البلاغ', en: 'Incident reported' },
  inc_review_started:{ ar: 'بدأت المراجعة', en: 'Review started' },
  inc_closed_ok:     { ar: 'أُغلقت الحادثة', en: 'Incident closed' },

  // ---- Chart documents / attachments ----
  documents_nav:    { ar: 'المستندات', en: 'Documents' },
  documents_title:  { ar: 'مستندات المريض', en: 'Patient Documents' },
  att_upload:       { ar: 'رفع مستند', en: 'Upload a document' },
  att_hint:         { ar: 'صور أو PDF حتى 600 ك.ب — تُحفظ على خادم الشبكة المحلية، لا سحابة.', en: 'Images or PDF up to 600 KB — stored on the LAN server, no cloud.' },
  att_file:         { ar: 'الملف', en: 'File' },
  att_note:         { ar: 'ملاحظة', en: 'Note' },
  att_upload_btn:   { ar: 'رفع', en: 'Upload' },
  att_download:     { ar: 'تنزيل', en: 'Download' },
  att_delete:       { ar: 'حذف', en: 'Delete' },
  att_none:         { ar: 'لا توجد مستندات بعد', en: 'No documents yet' },
  att_uploaded:     { ar: 'تم رفع المستند', en: 'Document uploaded' },
  att_deleted:      { ar: 'تم حذف المستند', en: 'Document deleted' },

  // ---- Internal referral / consult request ----
  referrals_nav:    { ar: 'الإحالات', en: 'Referrals' },
  referrals_title:  { ar: 'الإحالات والاستشارات', en: 'Referrals & Consults' },
  ref_new:          { ar: 'إحالة جديدة', en: 'New referral' },
  ref_patient:      { ar: 'المريض', en: 'Patient' },
  ref_to_dept:      { ar: 'إلى قسم', en: 'To department' },
  ref_specialty:    { ar: 'التخصص/السبب', en: 'Specialty / focus' },
  ref_reason:       { ar: 'سبب الإحالة', en: 'Reason for referral' },
  ref_urgency:      { ar: 'الأولوية', en: 'Urgency' },
  ref_urgent:       { ar: 'عاجل', en: 'Urgent' },
  ref_routine:      { ar: 'روتيني', en: 'Routine' },
  ref_submit:       { ar: 'إرسال الإحالة', en: 'Send referral' },
  ref_inbox:        { ar: 'الوارد', en: 'Incoming' },
  ref_outbox:       { ar: 'الصادر', en: 'Sent' },
  ref_none:         { ar: 'لا توجد إحالات', en: 'No referrals' },
  ref_accept:       { ar: 'قبول', en: 'Accept' },
  ref_complete:     { ar: 'إنهاء', en: 'Complete' },
  ref_decline:      { ar: 'رفض', en: 'Decline' },
  ref_response:     { ar: 'الرد', en: 'Response' },
  ref_status_open:      { ar: 'مفتوحة', en: 'Open' },
  ref_status_accepted:  { ar: 'مقبولة', en: 'Accepted' },
  ref_status_completed: { ar: 'مكتملة', en: 'Completed' },
  ref_status_declined:  { ar: 'مرفوضة', en: 'Declined' },
  ref_sent:         { ar: 'تم إرسال الإحالة', en: 'Referral sent' },
  ref_updated:      { ar: 'تم تحديث الإحالة', en: 'Referral updated' },
  ref_from:         { ar: 'من', en: 'From' },

  // ---- Care-gap / preventive reminders ----
  care_gaps_nav:    { ar: 'فجوات الرعاية', en: 'Care Gaps' },
  care_gaps_title:  { ar: 'تذكيرات الرعاية الوقائية', en: 'Preventive Care Reminders' },
  cg_none:          { ar: 'لا توجد فجوات رعاية مفتوحة 🎉', en: 'No open care gaps 🎉' },
  cg_dismiss:       { ar: 'تجاهل', en: 'Dismiss' },
  cg_dismiss_reason:{ ar: 'سبب التجاهل', en: 'Reason for dismissing' },
  cg_dismissed:     { ar: 'تم التجاهل', en: 'Dismissed' },
  cg_code_status:   { ar: 'حالة الإنعاش غير موثّقة', en: 'Code status not documented' },
  cg_vte:           { ar: 'لم تُطلب الوقاية من الجلطات (VTE)', en: 'VTE prophylaxis not ordered' },
  cg_vitals:        { ar: 'لا توجد علامات حيوية خلال ١٢ ساعة', en: 'No vitals in the last 12h' },
  cg_allergy:       { ar: 'حالة الحساسية غير موثّقة', en: 'Allergy status not documented' },
  cg_vaccine:       { ar: 'تطعيم مستحق/متأخر', en: 'Vaccination due/overdue' },

  // ---- Patient summary export (offline portable document) ----
  summary_nav:    { ar: 'الملخص', en: 'Summary' },
  summary_title:  { ar: 'الملخص السريري', en: 'Clinical Summary' },
  sum_intro:      { ar: 'يُولّد ملف HTML قائم بذاته يمكن حمله على USB — البديل دون إنترنت لتبادل السجلات (CCDA/HIE).', en: 'Generates a self-contained HTML file you can carry on a USB — the offline stand-in for record exchange (CCDA/HIE).' },
  sum_print:      { ar: 'طباعة', en: 'Print' },
  sum_download:   { ar: 'تنزيل (HTML)', en: 'Download (HTML)' },
  sum_exported:   { ar: 'تم تصدير الملخص', en: 'Summary exported' },
  sum_allergies:  { ar: 'الحساسية', en: 'Allergies' },
  sum_problems:   { ar: 'قائمة المشاكل', en: 'Problem list' },
  sum_meds:       { ar: 'الأدوية النشطة', en: 'Active medications' },
  sum_vitals:     { ar: 'أحدث العلامات الحيوية', en: 'Latest vitals' },
  sum_labs:       { ar: 'أحدث المختبرات', en: 'Recent labs' },
  sum_encounters: { ar: 'الزيارات', en: 'Encounters' },
  sum_generated:  { ar: 'تم الإنشاء:', en: 'Generated:' },
  sum_disclaimer: { ar: 'مُولّد دون اتصال؛ ليس سجلاً طبياً قانونياً.', en: 'Generated offline; not a legal medical record.' },
  sev_life_threatening: { ar: 'مهددة للحياة', en: 'Life-threatening' },

  // ---- Allergy Reactions ----
  react_rash:           { ar: 'طفح جلدي', en: 'Rash' },
  react_anaphylaxis:    { ar: 'صدمة تأقية', en: 'Anaphylaxis' },
  react_nausea:         { ar: 'غثيان', en: 'Nausea' },
  react_swelling:       { ar: 'تورم', en: 'Swelling' },
  react_breathing:      { ar: 'صعوبة تنفس', en: 'Difficulty Breathing' },
  react_other:          { ar: 'أخرى', en: 'Other' },

  // ---- Consultant ----
  my_dept_patients:     { ar: 'مرضى قسمي', en: 'My Department Patients' },
  case_assignment:      { ar: 'توزيع الحالات', en: 'Case Assignment' },
  staff_overview:       { ar: 'نظرة على الطاقم', en: 'Staff Overview' },
  assign_to_doctor:     { ar: 'تعيين لطبيب', en: 'Assign to Doctor' },
  unassigned:           { ar: 'غير معين', en: 'Unassigned' },
  assigned_to:          { ar: 'معين لـ', en: 'Assigned to' },
  assign_btn:           { ar: 'تعيين', en: 'Assign' },
  case_assigned_success:{ ar: 'تم تعيين الحالة بنجاح', en: 'Case assigned successfully' },

  // ---- Doctor ----
  my_patients:          { ar: 'مرضاي', en: 'My Patients' },
  write_prescription:   { ar: 'كتابة وصفة طبية', en: 'Write Prescription' },
  order_labs:           { ar: 'طلب تحاليل مخبرية', en: 'Order Lab Tests' },
  my_consultations:     { ar: 'استشاراتي', en: 'My Consultations' },
  new_consultation:     { ar: 'استشارة جديدة', en: 'New Consultation' },
  consult_initial:      { ar: 'تقييم أولي', en: 'Initial Assessment' },
  consult_followup:     { ar: 'متابعة', en: 'Follow-up' },
  consult_specialist:   { ar: 'استشارة تخصصية', en: 'Specialist Consultation' },
  consult_discharge:    { ar: 'ملخص الخروج', en: 'Discharge Summary' },
  subjective:           { ar: 'الشكوى الذاتية (ما يقوله المريض)', en: 'Subjective (what the patient says)' },
  objective:            { ar: 'الفحص الموضوعي (ما يلاحظه الطبيب)', en: 'Objective (what the doctor observes)' },
  assessment:           { ar: 'التقييم والتشخيص', en: 'Assessment / Diagnosis' },
  plan:                 { ar: 'الخطة العلاجية', en: 'Plan' },
  icd10:                { ar: 'رمز ICD-10', en: 'ICD-10 Code' },
  prescription:         { ar: 'الوصفة الطبية', en: 'Prescription' },
  drug_name:            { ar: 'اسم الدواء', en: 'Drug Name' },
  dose:                 { ar: 'الجرعة', en: 'Dose' },
  route:                { ar: 'طريقة الإعطاء', en: 'Route' },
  frequency:            { ar: 'التكرار', en: 'Frequency' },
  duration:             { ar: 'المدة', en: 'Duration' },
  start_date:           { ar: 'تاريخ البدء', en: 'Start Date' },
  end_date:             { ar: 'تاريخ الانتهاء', en: 'End Date' },
  prescribe_btn:        { ar: 'اعتماد الوصفة', en: 'Issue Prescription' },
  rx_issued:            { ar: 'تم اعتماد الوصفة بنجاح', en: 'Prescription issued successfully' },
  discharge_patient:    { ar: 'خروج المريض', en: 'Discharge Patient' },
  discharge_diagnosis:  { ar: 'تشخيص الخروج', en: 'Discharge Diagnosis' },
  discharge_instructions: { ar: 'تعليمات الخروج', en: 'Discharge Instructions' },
  followup_date:        { ar: 'تاريخ المتابعة', en: 'Follow-up Date' },

  // ---- Drug Routes ----
  route_oral:       { ar: 'عن طريق الفم', en: 'Oral' },
  route_iv:         { ar: 'وريدي', en: 'Intravenous (IV)' },
  route_im:         { ar: 'عضلي', en: 'Intramuscular (IM)' },
  route_sc:         { ar: 'تحت الجلد', en: 'Subcutaneous (SC)' },
  route_sublingual: { ar: 'تحت اللسان', en: 'Sublingual' },
  route_topical:    { ar: 'موضعي', en: 'Topical' },
  route_inhaled:    { ar: 'استنشاق', en: 'Inhaled' },
  route_pr:         { ar: 'شرجي', en: 'Per Rectum (PR)' },
  route_ng_tube:    { ar: 'عبر أنبوب أنفي معدي', en: 'Via NG Tube' },

  // ---- Drug Frequency ----
  freq_once_daily:       { ar: 'مرة واحدة يومياً', en: 'Once Daily' },
  freq_twice_daily:      { ar: 'مرتين يومياً', en: 'Twice Daily' },
  freq_three_times_daily:{ ar: 'ثلاث مرات يومياً', en: 'Three Times Daily' },
  freq_four_times_daily: { ar: 'أربع مرات يومياً', en: 'Four Times Daily' },
  freq_every_6h:         { ar: 'كل 6 ساعات', en: 'Every 6 Hours' },
  freq_every_8h:         { ar: 'كل 8 ساعات', en: 'Every 8 Hours' },
  freq_every_12h:        { ar: 'كل 12 ساعة', en: 'Every 12 Hours' },
  freq_as_needed:        { ar: 'عند الحاجة', en: 'As Needed (PRN)' },
  freq_stat:             { ar: 'فوراً', en: 'STAT (Immediately)' },
  freq_once:             { ar: 'مرة واحدة فقط', en: 'Once Only' },

  // ---- Drug Duration ----
  dur_3_days:     { ar: '3 أيام', en: '3 Days' },
  dur_5_days:     { ar: '5 أيام', en: '5 Days' },
  dur_7_days:     { ar: '7 أيام', en: '7 Days' },
  dur_14_days:    { ar: '14 يوم', en: '14 Days' },
  dur_until_review: { ar: 'حتى المراجعة', en: 'Until Review' },
  dur_ongoing:    { ar: 'مستمر', en: 'Ongoing' },
  dur_custom:     { ar: 'مخصص', en: 'Custom' },

  // ---- Lab Orders ----
  lab_test_name:  { ar: 'اسم التحليل', en: 'Test Name' },
  lab_priority:   { ar: 'الأولوية', en: 'Priority' },
  lab_stat:       { ar: 'طارئ', en: 'STAT' },
  lab_urgent:     { ar: 'عاجل', en: 'Urgent' },
  lab_routine:    { ar: 'روتيني', en: 'Routine' },
  order_lab_btn:  { ar: 'طلب التحليل', en: 'Order Lab Test' },
  lab_ordered_success: { ar: 'تم طلب التحليل بنجاح', en: 'Lab test ordered successfully' },

  // ---- Common Lab Tests ----

  lab_category:       { ar: 'الفئة', en: 'Category' },
  lab_subcategory:    { ar: 'الفئة الفرعية', en: 'Subcategory' },
  lab_select_category:{ ar: 'اختر الفئة', en: 'Select Category' },
  lab_select_subcategory:{ ar: 'اختر الفئة الفرعية', en: 'Select Subcategory' },
  lab_select_test:    { ar: 'اختر التحليل', en: 'Select Test' },
  lab_prep_notes:     { ar: 'تعليمات التحضير', en: 'Preparation Instructions' },
  lab_specimen:       { ar: 'نوع العينة', en: 'Specimen Type' },
  lab_container:      { ar: 'نوع الأنبوب', en: 'Container Type' },
  lab_mark_collected: { ar: 'تسجيل سحب العينة', en: 'Mark as Collected' },
  lab_mark_received:  { ar: 'تأكيد الاستلام', en: 'Confirm Receipt' },
  lab_enter_result:   { ar: 'إدخال النتيجة', en: 'Enter Result' },
  lab_result_value:   { ar: 'القيمة', en: 'Value' },
  lab_ref_range:      { ar: 'المعدل الطبيعي', en: 'Reference Range' },
  lab_result_flag:    { ar: 'العلامة', en: 'Flag' },
  lab_flag_normal:    { ar: 'طبيعي', en: 'Normal' },
  lab_flag_high:      { ar: 'مرتفع', en: 'High' },
  lab_flag_low:       { ar: 'منخفض', en: 'Low' },
  lab_flag_critical:  { ar: 'حرج', en: 'Critical' },
  lab_pending_collection: { ar: 'بانتظار سحب العينة', en: 'Pending Collection' },
  lab_pending_receipt:{ ar: 'بانتظار الاستلام', en: 'Pending Receipt' },
  lab_pending_result: { ar: 'بانتظار النتيجة', en: 'Pending Result' },
  lab_collected_success: { ar: 'تم تسجيل سحب العينة', en: 'Sample collection recorded' },
  lab_received_success:  { ar: 'تم تأكيد استلام العينة', en: 'Sample receipt confirmed' },
  lab_resulted_success:  { ar: 'تم إدخال النتيجة', en: 'Result entered successfully' },
  lab_component:      { ar: 'المكون', en: 'Component' },
  lab_unit:           { ar: 'الوحدة', en: 'Unit' },
  lab_view_results:   { ar: 'عرض النتائج', en: 'View Results' },
  lab_history:        { ar: 'سجل التحاليل', en: 'Lab History' },
  lab_pending_samples:{ ar: 'عينات بانتظار التحليل', en: 'Pending Samples' },
  lab_results_entry:  { ar: 'إدخال النتائج', en: 'Results Entry' },

  // Radiology
  rad_pending:        { ar: 'أشعة بانتظار التنفيذ', en: 'Pending Imaging' },
  rad_results:        { ar: 'نتائج الأشعة', en: 'Imaging Results' },
  rad_report:         { ar: 'تقرير الأشعة', en: 'Radiology Report' },

  // Lab Categories
  cat_blood:          { ar: 'تحاليل الدم', en: 'Blood Tests' },
  cat_urine:          { ar: 'تحاليل البول', en: 'Urine Tests' },
  cat_microbiology:   { ar: 'الأحياء الدقيقة', en: 'Microbiology' },
  cat_radiology:      { ar: 'الأشعة والتصوير', en: 'Radiology / Imaging' },
  cat_cardiology:     { ar: 'القلب والأوعية (رسم القلب)', en: 'Cardiology (ECG / Echo)' },
  cat_stool:          { ar: 'تحاليل البراز', en: 'Stool Tests' },
  cat_csf:            { ar: 'سائل النخاع الشوكي', en: 'CSF Analysis' },
  subcat_ecg:         { ar: 'رسم القلب الكهربائي (ECG)', en: 'ECG / EKG' },
  subcat_echo:        { ar: 'صدى القلب', en: 'Echocardiogram' },
  subcat_stress:      { ar: 'اختبار الجهد', en: 'Stress Test' },
  subcat_vascular:    { ar: 'أوعية دموية', en: 'Vascular Studies' },

  // Lab Subcategories
  subcat_hematology:       { ar: 'أمراض الدم', en: 'Hematology' },
  subcat_coagulation:      { ar: 'تحاليل التخثر', en: 'Coagulation' },
  subcat_chemistry_basic:  { ar: 'كيمياء أساسية', en: 'Chemistry - Basic' },
  subcat_chemistry_metabolic: { ar: 'كيمياء أيضية', en: 'Chemistry - Metabolic' },
  subcat_chemistry_liver:  { ar: 'وظائف الكبد', en: 'Liver Panel' },
  subcat_chemistry_renal:  { ar: 'وظائف الكلى', en: 'Renal Panel' },
  subcat_chemistry_cardiac:{ ar: 'إنزيمات القلب', en: 'Cardiac Markers' },
  subcat_chemistry_inflammatory: { ar: 'علامات الالتهاب', en: 'Inflammatory Markers' },
  subcat_blood_gas:        { ar: 'غازات الدم', en: 'Blood Gas' },
  subcat_blood_bank:       { ar: 'بنك الدم', en: 'Blood Bank' },
  subcat_tumor_markers:    { ar: 'دلالات الأورام', en: 'Tumor Markers' },
  subcat_tdm:              { ar: 'مراقبة مستوى الأدوية', en: 'Therapeutic Drug Monitoring' },
  subcat_urinalysis:       { ar: 'تحليل البول', en: 'Urinalysis' },
  subcat_urine_chemistry:  { ar: 'كيمياء البول', en: 'Urine Chemistry' },
  subcat_culture:          { ar: 'المزارع', en: 'Cultures' },
  subcat_serology:         { ar: 'المصليات', en: 'Serology' },
  subcat_stool_analysis:   { ar: 'تحليل البراز', en: 'Stool Analysis' },
  subcat_csf_analysis:     { ar: 'تحليل سائل النخاع', en: 'CSF Analysis' },
  subcat_xray:             { ar: 'أشعة سينية', en: 'X-Ray' },
  subcat_ultrasound:       { ar: 'موجات صوتية', en: 'Ultrasound' },
  subcat_ct:               { ar: 'أشعة مقطعية', en: 'CT Scan' },
  subcat_mri:              { ar: 'رنين مغناطيسي', en: 'MRI' },
  subcat_fluoroscopy:      { ar: 'تنظير إشعاعي', en: 'Fluoroscopy' },
  subcat_nuclear:          { ar: 'طب نووي', en: 'Nuclear Medicine' },

  // Nursing Procedures
  proc_guide:           { ar: 'دليل الإجراءات التمريضية', en: 'Nursing Procedure Guide' },
  proc_select:          { ar: 'اختر الإجراء', en: 'Select Procedure' },
  proc_warnings:        { ar: 'تحذيرات', en: 'Warnings' },
  proc_complete:        { ar: 'إتمام الإجراء', en: 'Complete Procedure' },
  proc_step_done:       { ar: 'تم', en: 'Done' },
  proc_completed:       { ar: 'مكتمل', en: 'Completed' },
  proc_cat_iv:          { ar: 'الوصول الوريدي', en: 'IV Access' },
  proc_cat_catheter:    { ar: 'القسطرة', en: 'Catheterization' },
  proc_cat_wound:       { ar: 'العناية بالجروح', en: 'Wound Care' },
  proc_cat_medication:  { ar: 'إعطاء الأدوية', en: 'Medication Administration' },
  proc_cat_respiratory: { ar: 'العناية التنفسية', en: 'Respiratory Care' },
  proc_cat_assessment:  { ar: 'التقييم', en: 'Assessment' },
  proc_cat_specimen:    { ar: 'جمع العينات', en: 'Specimen Collection' },
  proc_cat_emergency:   { ar: 'الطوارئ', en: 'Emergency' },

  // Smart Suggestions
  smart_suggested_labs: { ar: 'تحاليل مقترحة', en: 'Suggested Lab Tests' },

  // ---- Senior Nurse ----
  ward_overview:    { ar: 'نظرة عامة على الجناح', en: 'Ward Overview' },
  nurse_assignment: { ar: 'توزيع التمريض', en: 'Nurse Assignment' },
  supply_stock:     { ar: 'مخزون المستلزمات', en: 'Supply Stock' },
  complexity:       { ar: 'مستوى التعقيد', en: 'Complexity Score' },
  assigned_nurse:   { ar: 'الممرض/ة المسؤول/ة', en: 'Assigned Nurse' },
  shift_morning:    { ar: 'صباحي', en: 'Morning' },
  shift_afternoon:  { ar: 'مسائي', en: 'Afternoon' },
  shift_night:      { ar: 'ليلي', en: 'Night' },

  // ---- Nurse ----
  my_tasks:         { ar: 'مهامي', en: 'My Tasks' },
  end_of_shift:     { ar: 'نهاية المناوبة', en: 'End of Shift' },
  task_pending:     { ar: 'قيد الانتظار', en: 'Pending' },
  task_done:        { ar: 'مكتمل', en: 'Completed' },
  task_skipped:     { ar: 'تم تخطيه', en: 'Skipped' },
  mark_done:        { ar: 'تم', en: 'Mark Done' },

  // ---- Nursing Task Types ----
  task_repositioning:    { ar: 'تغيير وضعية المريض', en: 'Patient Repositioning' },
  task_medication_given: { ar: 'إعطاء الدواء', en: 'Medication Administration' },
  task_vitals_check:     { ar: 'قياس العلامات الحيوية', en: 'Vital Signs Check' },
  task_iv_check:         { ar: 'فحص الوريد', en: 'IV Site Check' },
  task_fluid_intake:     { ar: 'سوائل مُتناولة', en: 'Fluid Intake' },
  task_urine_output:     { ar: 'كمية البول', en: 'Urine Output' },
  task_wound_care:       { ar: 'عناية بالجرح', en: 'Wound Care' },
  task_hygiene:          { ar: 'نظافة شخصية', en: 'Personal Hygiene' },
  task_ventilator_check: { ar: 'فحص جهاز التنفس', en: 'Ventilator Check' },
  task_blood_sugar:      { ar: 'فحص السكر', en: 'Blood Sugar Check' },
  task_education:        { ar: 'تثقيف المريض', en: 'Patient Education' },
  task_handover:         { ar: 'ملاحظات التسليم', en: 'Handover Notes' },

  // ---- Vitals ----
  bp_systolic:    { ar: 'ضغط الدم الانقباضي', en: 'BP Systolic' },
  bp_diastolic:   { ar: 'ضغط الدم الانبساطي', en: 'BP Diastolic' },
  heart_rate:     { ar: 'معدل نبض القلب', en: 'Heart Rate' },
  temperature:    { ar: 'درجة الحرارة', en: 'Temperature' },
  o2_saturation:  { ar: 'تشبع الأكسجين', en: 'O2 Saturation' },
  weight:         { ar: 'الوزن (كجم)', en: 'Weight (kg)' },
  height:         { ar: 'الطول (سم)', en: 'Height (cm)' },
  rbs_value:      { ar: 'سكر الدم العشوائي', en: 'Random Blood Sugar' },
  vitals_recorded:{ ar: 'تم تسجيل العلامات الحيوية', en: 'Vitals recorded successfully' },

  // ---- Pharmacist ----
  prescription_queue:  { ar: 'طابور الوصفات', en: 'Prescription Queue' },
  drug_inventory:      { ar: 'مخزون الأدوية', en: 'Drug Inventory' },
  receive_stock:       { ar: 'استلام مخزون', en: 'Receive Stock' },
  dispensing_log:      { ar: 'سجل الصرف', en: 'Dispensing Log' },
  dispense_btn:        { ar: 'صرف', en: 'Dispense' },
  dispensed_success:   { ar: 'تم صرف الدواء بنجاح', en: 'Medication dispensed successfully' },
  stock_qty:           { ar: 'الكمية المتوفرة', en: 'Stock Quantity' },
  min_threshold:       { ar: 'الحد الأدنى', en: 'Minimum Threshold' },
  low_stock_alert:     { ar: 'تنبيه: المخزون منخفض!', en: 'Alert: Low Stock!' },
  batch_number:        { ar: 'رقم الدفعة', en: 'Batch Number' },
  expiry_date:         { ar: 'تاريخ الانتهاء', en: 'Expiry Date' },
  qty_to_receive:      { ar: 'الكمية المستلمة', en: 'Quantity to Receive' },
  stock_received_success: { ar: 'تم استلام المخزون بنجاح', en: 'Stock received successfully' },

  // ---- Kitchen ----
  diet_code:         { ar: 'رمز الوجبة', en: 'Diet Code' },
  diet_description:  { ar: 'وصف الوجبة', en: 'Diet Description' },
  refused:           { ar: 'رفض المريض', en: 'Patient Refused' },
  meal_breakfast:    { ar: 'فطور', en: 'Breakfast' },
  meal_lunch:        { ar: 'غداء', en: 'Lunch' },
  meal_dinner:       { ar: 'عشاء', en: 'Dinner' },
  meal_snack:        { ar: 'وجبة خفيفة', en: 'Snack' },
  room:              { ar: 'الغرفة', en: 'Room' },

  // ---- Alerts ----

  // ---- Review Panel ----
  reason:              { ar: 'السبب', en: 'Reason' },
  field:               { ar: 'الحقل', en: 'Field' },

  // ---- Supply Items ----
  quantity:            { ar: 'الكمية', en: 'Quantity' },

  // ---- Database / System ----
  download_backup:     { ar: 'تحميل نسخة احتياطية', en: 'Download Backup' },
  restore_backup:      { ar: 'استعادة نسخة احتياطية', en: 'Restore Backup' },
  db_saved:            { ar: 'تم حفظ قاعدة البيانات', en: 'Database saved' },
  db_loaded:           { ar: 'تم تحميل قاعدة البيانات', en: 'Database loaded' },

  // Reception
  rcp_queue:            { ar: 'قائمة المرضى', en: 'Patient Queue' },
  rcp_register:         { ar: 'تسجيل مريض جديد', en: 'Register New Patient' },
  rcp_appointments:     { ar: 'المواعيد', en: 'Appointments' },
  rcp_billing:          { ar: 'الفواتير', en: 'Billing' },
  sn_beds:              { ar: 'إدارة الأسرة', en: 'Bed Management' },
  hm_beds:              { ar: 'خريطة الأسرة', en: 'Bed Map' },
  doc_appointments:     { ar: 'مواعيدي', en: 'My Appointments' },
  appt_date:            { ar: 'تاريخ الموعد', en: 'Appointment Date' },
  appt_time:            { ar: 'وقت الموعد', en: 'Appointment Time' },
  bed_number:           { ar: 'رقم السرير', en: 'Bed Number' },
  // HR & Orientation

  // ---- Surgical / OR Management ----
  surgical_schedule:    { ar: 'جدول العمليات', en: 'Surgical Schedule' },
  or_calendar:          { ar: 'تقويم غرف العمليات', en: 'OR Calendar' },
  book_surgery:         { ar: 'حجز عملية', en: 'Book Surgery' },
  procedure_name:       { ar: 'اسم العملية', en: 'Procedure Name' },
  anesthesia_type:      { ar: 'نوع التخدير', en: 'Anesthesia Type' },
  anesthesia_general:   { ar: 'تخدير عام', en: 'General' },
  anesthesia_spinal:    { ar: 'تخدير نخاعي', en: 'Spinal' },
  anesthesia_epidural:  { ar: 'تخدير فوق الجافية', en: 'Epidural' },
  anesthesia_local:     { ar: 'تخدير موضعي', en: 'Local' },
  anesthesia_regional:  { ar: 'تخدير ناحي', en: 'Regional' },
  anesthesia_sedation:  { ar: 'تهدئة', en: 'Sedation' },
  or_room:              { ar: 'غرفة العمليات', en: 'OR Room' },
  scheduled_date:       { ar: 'تاريخ العملية', en: 'Scheduled Date' },
  scheduled_time:       { ar: 'وقت العملية', en: 'Scheduled Time' },
  estimated_duration:   { ar: 'المدة المتوقعة (دقيقة)', en: 'Est. Duration (min)' },
  pre_op_diagnosis:     { ar: 'التشخيص قبل العملية', en: 'Pre-Op Diagnosis' },
  pre_op_checklist:     { ar: 'قائمة التحقق قبل العملية', en: 'Pre-Op Checklist' },
  consent_signed:       { ar: 'تم توقيع الموافقة', en: 'Consent Signed' },
  site_marked:          { ar: 'تم تحديد الموقع', en: 'Site Marked' },
  npo_verified:         { ar: 'تم التحقق من الصيام', en: 'NPO Verified' },
  blood_type_confirmed: { ar: 'تأكيد فصيلة الدم', en: 'Blood Type Confirmed' },
  allergies_reviewed:   { ar: 'مراجعة الحساسية', en: 'Allergies Reviewed' },
  surgical_team_notes:  { ar: 'ملاحظات الفريق الجراحي', en: 'Surgical Team Notes' },
  equipment_notes:      { ar: 'ملاحظات المعدات', en: 'Equipment Notes' },
  post_op_notes:        { ar: 'ملاحظات ما بعد العملية', en: 'Post-Op Notes' },
  complications_lbl:    { ar: 'المضاعفات', en: 'Complications' },
  surg_scheduled:       { ar: 'مجدولة', en: 'Scheduled' },
  surg_pre_op:          { ar: 'تحضير', en: 'Pre-Op' },
  surg_in_progress:     { ar: 'جارية', en: 'In Progress' },
  surg_completed:       { ar: 'مكتملة', en: 'Completed' },
  surg_cancelled:       { ar: 'ملغية', en: 'Cancelled' },
  surgery_booked:       { ar: 'تم حجز العملية بنجاح', en: 'Surgery booked successfully' },
  surgery_updated:      { ar: 'تم تحديث حالة العملية', en: 'Surgery status updated' },
  start_pre_op:         { ar: 'بدء التحضير', en: 'Start Pre-Op' },
  begin_surgery:        { ar: 'بدء العملية', en: 'Begin Surgery' },
  complete_surgery:     { ar: 'إنهاء العملية', en: 'Complete Surgery' },
  cancel_surgery:       { ar: 'إلغاء العملية', en: 'Cancel Surgery' },
  surgeries_today:      { ar: 'عمليات اليوم', en: 'Surgeries Today' },
  total_scheduled:      { ar: 'مجدولة', en: 'Scheduled' },
  total_completed:      { ar: 'مكتملة', en: 'Completed' },
  total_in_progress:    { ar: 'جارية', en: 'In Progress' },

  // ---- Dietary / Nutrition ----
  diet_orders:          { ar: 'طلبات التغذية', en: 'Diet Orders' },
  meal_tracking:        { ar: 'تتبع الوجبات', en: 'Meal Tracking' },
  nutrition_assessment: { ar: 'التقييم الغذائي', en: 'Nutritional Assessment' },
  diet_type:            { ar: 'نوع الحمية', en: 'Diet Type' },
  diet_regular:         { ar: 'عادي', en: 'Regular' },
  diet_diabetic:        { ar: 'سكري', en: 'Diabetic' },
  diet_cardiac:         { ar: 'قلبي', en: 'Cardiac' },
  diet_renal:           { ar: 'كلوي', en: 'Renal' },
  diet_low_sodium:      { ar: 'قليل الملح', en: 'Low Sodium' },
  diet_soft:            { ar: 'طري', en: 'Soft' },
  diet_liquid:          { ar: 'سوائل', en: 'Liquid' },
  diet_npo:             { ar: 'ممنوع بالفم', en: 'NPO' },
  diet_halal:           { ar: 'حلال', en: 'Halal' },
  diet_pediatric:       { ar: 'أطفال', en: 'Pediatric' },
  food_allergies:       { ar: 'حساسية الطعام', en: 'Food Allergies' },
  calorie_target:       { ar: 'السعرات المستهدفة', en: 'Calorie Target' },
  special_instructions: { ar: 'تعليمات خاصة', en: 'Special Instructions' },
  meal_type:            { ar: 'نوع الوجبة', en: 'Meal Type' },
  meal_breakfast:       { ar: 'فطور', en: 'Breakfast' },
  meal_lunch:           { ar: 'غداء', en: 'Lunch' },
  meal_dinner:          { ar: 'عشاء', en: 'Dinner' },
  meal_snack:           { ar: 'وجبة خفيفة', en: 'Snack' },
  items_served:         { ar: 'الأصناف المقدمة', en: 'Items Served' },
  intake_percentage:    { ar: 'نسبة الاستهلاك', en: 'Intake %' },
  weight_kg:            { ar: 'الوزن (كجم)', en: 'Weight (kg)' },
  height_cm:            { ar: 'الطول (سم)', en: 'Height (cm)' },
  bmi_label:            { ar: 'مؤشر كتلة الجسم', en: 'BMI' },
  nutritional_risk:     { ar: 'المخاطر الغذائية', en: 'Nutritional Risk' },
  risk_low:             { ar: 'منخفض', en: 'Low' },
  risk_moderate:        { ar: 'متوسط', en: 'Moderate' },
  risk_high:            { ar: 'مرتفع', en: 'High' },
  diet_order_placed:    { ar: 'تم طلب الحمية بنجاح', en: 'Diet order placed successfully' },
  meal_logged:          { ar: 'تم تسجيل الوجبة', en: 'Meal logged successfully' },
  assessment_saved:     { ar: 'تم حفظ التقييم الغذائي', en: 'Nutritional assessment saved' },
  order_diet:           { ar: 'طلب حمية', en: 'Order Diet' },
  log_meal:             { ar: 'تسجيل وجبة', en: 'Log Meal' },
  new_assessment:       { ar: 'تقييم جديد', en: 'New Assessment' },
  active_orders:        { ar: 'طلبات نشطة', en: 'Active Orders' },
  discontinue:          { ar: 'إيقاف', en: 'Discontinue' },

  // ---- Social Work / Case Management ----
  sw_cases:             { ar: 'حالات الخدمة الاجتماعية', en: 'Social Work Cases' },
  sw_new_case:          { ar: 'تقييم جديد', en: 'New Assessment' },
  sw_discharge_plan:    { ar: 'خطة التخريج', en: 'Discharge Planning' },
  psychosocial_assessment: { ar: 'التقييم النفسي الاجتماعي', en: 'Psychosocial Assessment' },
  living_situation:     { ar: 'الوضع المعيشي', en: 'Living Situation' },
  live_independent:     { ar: 'مستقل', en: 'Independent' },
  live_with_family:     { ar: 'مع العائلة', en: 'With Family' },
  live_assisted:        { ar: 'رعاية مساعدة', en: 'Assisted Living' },
  live_homeless:        { ar: 'بلا مأوى', en: 'Homeless' },
  support_system:       { ar: 'نظام الدعم', en: 'Support System' },
  support_strong:       { ar: 'قوي', en: 'Strong' },
  support_moderate:     { ar: 'متوسط', en: 'Moderate' },
  support_limited:      { ar: 'محدود', en: 'Limited' },
  support_none:         { ar: 'لا يوجد', en: 'None' },
  insurance_status:     { ar: 'حالة التأمين', en: 'Insurance Status' },
  ins_insured:          { ar: 'مؤمن', en: 'Insured' },
  ins_uninsured:        { ar: 'غير مؤمن', en: 'Uninsured' },
  ins_pending:          { ar: 'قيد المراجعة', en: 'Pending' },
  discharge_needs:      { ar: 'احتياجات التخريج', en: 'Discharge Needs' },
  referrals_lbl:        { ar: 'التحويلات', en: 'Referrals' },
  follow_up_needed:     { ar: 'يحتاج متابعة', en: 'Follow-up Needed' },
  contact_type:         { ar: 'نوع التواصل', en: 'Contact Type' },
  contact_face:         { ar: 'مقابلة شخصية', en: 'Face-to-Face' },
  contact_phone:        { ar: 'اتصال هاتفي', en: 'Phone Call' },
  contact_transport_arranged: { ar: 'ترتيب نقل', en: 'Transport Arranged' },
  contact_family_meeting: { ar: 'اجتماع عائلي', en: 'Family Meeting' },
  contact_community:    { ar: 'تواصل مجتمعي', en: 'Community Contact' },
  // alias: sw_contacts.contact_type stores 'face_to_face'; render code derives
  // the key as 'contact_' + value, which never matched contact_face above
  contact_face_to_face: { ar: 'مقابلة شخصية', en: 'Face-to-Face' },
  // keys referenced by views but previously missing from BOTH languages —
  // t() fell back to the raw key, so tables showed literal 'patient_name' etc.
  patient_name:         { ar: 'اسم المريض', en: 'Patient Name' },
  bed:                  { ar: 'السرير', en: 'Bed' },
  category:             { ar: 'الفئة', en: 'Category' },
  type:                 { ar: 'النوع', en: 'Type' },
  score:                { ar: 'النتيجة', en: 'Score' },
  risk_level:           { ar: 'مستوى الخطورة', en: 'Risk Level' },
  shift:                { ar: 'المناوبة', en: 'Shift' },
  restrictions:         { ar: 'القيود', en: 'Restrictions' },
  notes_label:          { ar: 'ملاحظات', en: 'Notes' },
  yes:                  { ar: 'نعم', en: 'Yes' },
  no:                   { ar: 'لا', en: 'No' },
  psychosocial_risk:    { ar: 'الخطورة النفسية الاجتماعية', en: 'Psychosocial Risk' },
  sw_status_updated:    { ar: 'تم تحديث حالة القضية', en: 'Case status updated' },
  sw_case_open:         { ar: 'مفتوحة', en: 'Open' },
  sw_case_in_progress:  { ar: 'قيد المتابعة', en: 'In Progress' },
  sw_case_resolved:     { ar: 'تم الحل', en: 'Resolved' },
  sw_case_closed:       { ar: 'مغلقة', en: 'Closed' },
  sw_case_created:      { ar: 'تم إنشاء الحالة', en: 'Case created successfully' },
  sw_contact_logged:    { ar: 'تم تسجيل التواصل', en: 'Contact logged successfully' },
  log_contact:          { ar: 'تسجيل تواصل', en: 'Log Contact' },
  update_status:        { ar: 'تحديث الحالة', en: 'Update Status' },
  close_case:           { ar: 'إغلاق الحالة', en: 'Close Case' },
  open_cases:           { ar: 'حالات مفتوحة', en: 'Open Cases' },
  high_risk:            { ar: 'خطر مرتفع', en: 'High Risk' },
  medium_risk:          { ar: 'خطر متوسط', en: 'Medium Risk' },
  needs_follow_up:      { ar: 'تحتاج متابعة', en: 'Needs Follow-up' },
  contact_history:      { ar: 'سجل التواصل', en: 'Contact History' },

  // ---- MAR (Medication Administration Record) ----
  mar_title:            { ar: 'سجل إعطاء الأدوية (MAR)', en: 'Medication Administration Record (MAR)' },
  mar_drug:             { ar: 'الدواء', en: 'Drug' },
  mar_dose:             { ar: 'الجرعة', en: 'Dose' },
  mar_route:            { ar: 'الطريق', en: 'Route' },
  mar_scheduled:        { ar: 'الموعد المحدد', en: 'Scheduled Time' },
  mar_status:           { ar: 'الحالة', en: 'Status' },
  mar_given:            { ar: 'أُعطي', en: 'Given' },
  mar_held:             { ar: 'محجوب', en: 'Held' },
  mar_refused:          { ar: 'رفض المريض', en: 'Patient Refused' },
  mar_pending:          { ar: 'بانتظار الإعطاء', en: 'Pending' },
  mar_log_btn:          { ar: 'تسجيل الإعطاء', en: 'Log Administration' },
  mar_given_at:         { ar: 'وقت الإعطاء', en: 'Given At' },
  mar_hold_reason:      { ar: 'سبب الحجب', en: 'Hold Reason' },
  mar_notes:            { ar: 'ملاحظات', en: 'Notes' },
  mar_logged:           { ar: 'تم تسجيل إعطاء الدواء', en: 'Drug administration recorded' },
  mar_today_doses:      { ar: 'جرعات اليوم', en: "Today's Doses" },
  mar_given_count:      { ar: 'جرعات أُعطيت', en: 'Doses Given' },
  mar_pending_count:    { ar: 'جرعات بانتظار', en: 'Pending Doses' },
  mar_active_orders:    { ar: 'أوامر دوائية فعّالة', en: 'Active Orders' },
  mar_held_count:       { ar: 'جرعات محجوبة', en: 'Held Doses' },
  mar_patient:          { ar: 'المريض', en: 'Patient' },
  mar_prescribed_by:    { ar: 'طلب بواسطة', en: 'Prescribed By' },
  mar_administered_by:  { ar: 'أُعطي بواسطة', en: 'Administered By' },

  // ---- Critical Lab Acknowledgment ----
  critical_lab_alert:   { ar: 'تنبيه: نتيجة مخبرية حرجة تحتاج تأكيدك', en: 'CRITICAL LAB VALUE — Requires Your Acknowledgment' },
  critical_ack_btn:     { ar: 'أؤكد استلامي لهذه النتيجة', en: 'Acknowledge This Result' },
  critical_ack_comment: { ar: 'تعليق (الإجراء المتخذ)', en: 'Comment (action taken)' },
  critical_ack_done:    { ar: 'تم التأكيد وتسجيل الإجراء', en: 'Acknowledged and logged' },

  // ---- NEWS2 / qSOFA ----
  news2_score:          { ar: 'درجة NEWS2', en: 'NEWS2 Score' },

  // ---- Nursing Assessment Scales ----
  braden_scale:         { ar: 'مقياس برادن (تقرحات الضغط)', en: 'Braden Scale (Pressure Ulcer Risk)' },
  gcs_scale:            { ar: 'مقياس غلاسكو للوعي', en: 'Glasgow Coma Scale (GCS)' },
  pain_scale:           { ar: 'مقياس الألم (NRS)', en: 'Pain Scale (NRS 0-10)' },
  risk_very_high:       { ar: 'خطر مرتفع جداً', en: 'Very High Risk' },
  risk_none:            { ar: 'لا خطر', en: 'No Risk' },
  braden_sensory:       { ar: 'الإدراك الحسي', en: 'Sensory Perception' },
  braden_moisture:      { ar: 'الرطوبة', en: 'Moisture' },
  braden_activity:      { ar: 'النشاط', en: 'Activity' },
  braden_mobility:      { ar: 'الحركة', en: 'Mobility' },
  braden_nutrition:     { ar: 'التغذية', en: 'Nutrition' },
  braden_friction:      { ar: 'الاحتكاك والقص', en: 'Friction & Shear' },
  morse_iv:             { ar: 'وريدي / هيبارين قفل', en: 'IV / Heparin Lock' },
  morse_gait:           { ar: 'المشية', en: 'Gait / Transferring' },
  morse_mental:         { ar: 'الحالة الذهنية', en: 'Mental Status' },
  gcs_eyes:             { ar: 'فتح العينين', en: 'Eye Opening' },
  gcs_verbal:           { ar: 'الاستجابة اللفظية', en: 'Verbal Response' },
  gcs_motor:            { ar: 'الاستجابة الحركية', en: 'Motor Response' },
  gcs_severe:           { ar: 'إصابة شديدة (≤8)', en: 'Severe Injury (≤8)' },
  gcs_moderate:         { ar: 'إصابة متوسطة (9-12)', en: 'Moderate Injury (9-12)' },
  gcs_mild:             { ar: 'إصابة خفيفة (13-15)', en: 'Mild Injury (13-15)' },

  // ---- Order Sets ----

  // ---- Fluid Balance ----
  fluid_balance:        { ar: 'الموازنة السائلة (دخل/خرج)', en: 'Fluid Balance (I&O)' },
  fluid_intake:         { ar: 'الدخل', en: 'Intake' },
  fluid_output:         { ar: 'الخرج', en: 'Output' },
  fluid_logged:         { ar: 'تم تسجيل السائل', en: 'Fluid logged' },
  log_intake:           { ar: 'تسجيل دخل', en: 'Log Intake' },
  log_output:           { ar: 'تسجيل خرج', en: 'Log Output' },

  // ---- Discharge & SBAR Checklists ----

  // ---- QR Wristband ----

  // ---- Vitals extra fields ----
  resp_rate:            { ar: 'معدل التنفس', en: 'Respiratory Rate' },
  on_o2_supplement:     { ar: 'يتلقى أكسجين إضافي', en: 'On Supplemental O₂' },
  consciousness_level:  { ar: 'مستوى الوعي', en: 'Consciousness Level' },
  consciousness_alert:  { ar: 'يقظ', en: 'Alert' },
  consciousness_voice:  { ar: 'يستجيب للصوت', en: 'Responds to Voice' },
  consciousness_pain:   { ar: 'يستجيب للألم', en: 'Responds to Pain' },
  consciousness_unresponsive: { ar: 'لا يستجيب', en: 'Unresponsive' },

  // ---- NEWS2 alerts ----
  news2_high_title:     { ar: 'تحذير: NEWS2 مرتفع جداً', en: 'Warning: HIGH NEWS2 Score' },
  news2_high_body:      { ar: 'النتيجة تشير إلى تدهور حاد في حالة المريض. يجب إبلاغ الطبيب فوراً.', en: 'Score indicates acute deterioration. Notify physician immediately.' },
  news2_high_action:    { ar: 'أبلغ الطبيب الآن واستعد لنقل المريض لوحدة العناية المركزة.', en: 'Notify MD now and prepare for possible ICU transfer.' },
  news2_medium_title:   { ar: 'تنبيه: NEWS2 متوسط', en: 'Alert: MEDIUM NEWS2 Score' },
  news2_medium_body:    { ar: 'الحالة تحتاج مراقبة مكثفة. راجع الطبيب.', en: 'Patient needs increased monitoring. Review with physician.' },
  news2_medium_action:  { ar: 'راقب المريض كل 30 دقيقة وأبلغ الطبيب.', en: 'Monitor every 30 min and inform physician.' },
  news2_red_title:      { ar: 'تنبيه: درجة 3 في مؤشر واحد', en: 'Alert: Single Parameter Scored 3' },
  news2_red_body:       { ar: 'أحد المؤشرات الحيوية سجّل الدرجة القصوى (3) رغم أن المجموع منخفض. هذا يتطلب تصعيداً وفق NEWS2.', en: 'One vital sign scored the maximum (3) even though the total is low. NEWS2 requires escalation for this.' },
  news2_red_action:     { ar: 'زِد المراقبة إلى كل ساعة على الأقل وأبلغ الفريق الطبي لمراجعة عاجلة.', en: 'Increase observations to at least 1-hourly and inform the medical team for urgent review.' },

  // ---- qSOFA alerts ----
  qsofa_alert_title:    { ar: '🚨 تنبيه: خطر الإنتان (qSOFA إيجابي)', en: '🚨 SEPSIS ALERT: Positive qSOFA' },
  qsofa_alert_body:     { ar: 'المريض لديه 2 أو أكثر من معايير qSOFA. يُشتبه بالإنتان.', en: 'Patient meets ≥2 qSOFA criteria. Sepsis suspected.' },
  qsofa_action:         { ar: 'طبق بروتوكول الإنتان فوراً. أبلغ الطبيب وخذ مزارع الدم قبل المضادات.', en: 'Activate Sepsis Bundle now. Notify MD, get blood cultures before antibiotics.' },
  understood:           { ar: 'فهمت، سأتصرف فوراً', en: 'Understood — I will act now' },

  // ---- Nursing Assessments ----
  assessments_title:    { ar: 'التقييمات التمريضية', en: 'Nursing Assessments' },
  new_assessment:       { ar: 'تقييم جديد', en: 'New Assessment' },
  assessment_history:   { ar: 'سجل التقييمات', en: 'Assessment History' },
  assessment_saved:     { ar: 'تم حفظ التقييم', en: 'Assessment saved' },
  no_assigned_patients: { ar: 'لا يوجد مرضى معيّنون لهذه المناوبة', en: 'No assigned patients this shift' },

  // Braden scale
  braden_hint:          { ar: 'الدرجة الأقل = الخطر الأعلى. إجمالي ≤12 = خطر عالٍ لقرح الضغط', en: 'Lower score = higher risk. Total ≤12 = high pressure ulcer risk' },
  braden_sensory:       { ar: 'الإحساس/الإدراك الحسي', en: 'Sensory Perception' },
  braden_moisture:      { ar: 'الرطوبة (تعرض الجلد للرطوبة)', en: 'Moisture' },
  braden_activity:      { ar: 'النشاط', en: 'Activity' },
  braden_mobility:      { ar: 'الحركة', en: 'Mobility' },
  braden_nutrition:     { ar: 'التغذية', en: 'Nutrition' },
  braden_friction:      { ar: 'الاحتكاك والانزلاق', en: 'Friction & Shear' },
  braden_s1: { ar: 'لا يحس تماماً', en: 'Completely Limited' },
  braden_s2: { ar: 'محدود جداً', en: 'Very Limited' },
  braden_s3: { ar: 'محدود قليلاً', en: 'Slightly Limited' },
  braden_s4: { ar: 'لا توجد قيود', en: 'No Impairment' },
  braden_m1: { ar: 'مبلل دائماً', en: 'Constantly Moist' },
  braden_m2: { ar: 'مبلل في الغالب', en: 'Often Moist' },
  braden_m3: { ar: 'مبلل أحياناً', en: 'Occasionally Moist' },
  braden_m4: { ar: 'نادراً مبلل', en: 'Rarely Moist' },
  braden_a1: { ar: 'طريح الفراش', en: 'Bedfast' },
  braden_a2: { ar: 'على كرسي متحرك', en: 'Chairfast' },
  braden_a3: { ar: 'يمشي أحياناً', en: 'Walks Occasionally' },
  braden_a4: { ar: 'يمشي كثيراً', en: 'Walks Frequently' },
  braden_mo1: { ar: 'لا حراك كلياً', en: 'Completely Immobile' },
  braden_mo2: { ar: 'محدود جداً', en: 'Very Limited' },
  braden_mo3: { ar: 'محدود قليلاً', en: 'Slightly Limited' },
  braden_mo4: { ar: 'لا قيود', en: 'No Limitation' },
  braden_n1: { ar: 'سيئ جداً', en: 'Very Poor' },
  braden_n2: { ar: 'غير كافٍ', en: 'Probably Inadequate' },
  braden_n3: { ar: 'كافٍ', en: 'Adequate' },
  braden_n4: { ar: 'ممتاز', en: 'Excellent' },
  braden_f1: { ar: 'مشكلة', en: 'Problem' },
  braden_f2: { ar: 'مشكلة محتملة', en: 'Potential Problem' },
  braden_f3: { ar: 'لا مشكلة', en: 'No Apparent Problem' },
  braden_high_risk_alert:  { ar: 'خطر عالٍ لقرح الضغط!', en: 'High Pressure Ulcer Risk!' },
  braden_high_risk_action: { ar: 'ابدأ فوراً: غير الوضعية كل ساعتين، وضائد الكعب، مراتب مضادة للضغط.', en: 'Start immediately: reposition q2h, heel protectors, pressure-relieving mattress.' },

  // Morse Fall Scale
  morse_fall:           { ar: 'مقياس مورس للسقوط', en: 'Morse Fall Scale' },
  morse_history:        { ar: 'سقوط سابق (خلال 3 أشهر)', en: 'History of Falling (past 3 months)' },
  morse_diagnosis:      { ar: 'تشخيص ثانوي', en: 'Secondary Diagnosis' },
  morse_ambulatory:     { ar: 'مساعدة في المشي', en: 'Ambulatory Aid' },
  morse_iv:             { ar: 'خط وريدي / هيبارين', en: 'IV / Heparin Lock' },
  morse_gait:           { ar: 'نوع المشية', en: 'Gait' },
  morse_mental:         { ar: 'الحالة العقلية', en: 'Mental Status' },
  morse_amb_none:       { ar: 'بلا مساعدة / طريح / كرسي متحرك', en: 'None / Bedrest / Wheelchair' },
  morse_amb_aid:        { ar: 'عصا / مشاية', en: 'Crutches / Cane / Walker' },
  morse_amb_furniture:  { ar: 'يتكئ على الأثاث', en: 'Furniture' },
  morse_gait_normal:    { ar: 'طبيعي / لا يمشي', en: 'Normal / Bedrest / Immobile' },
  morse_gait_weak:      { ar: 'ضعيف', en: 'Weak' },
  morse_gait_impaired:  { ar: 'مضطرب', en: 'Impaired' },
  morse_mental_oriented:    { ar: 'مدرك لقدراته', en: 'Oriented to own ability' },
  morse_mental_overestimate: { ar: 'يبالغ في تقدير قدراته', en: 'Forgets limitations' },
  morse_high_risk_alert:    { ar: 'خطر سقوط عالٍ!', en: 'High Fall Risk!' },
  morse_high_risk_action:   { ar: 'فعّل بروتوكول السقوط: سوار أصفر، حواجز السرير، جرس في متناول اليد.', en: 'Activate Fall Protocol: yellow wristband, side rails up, call bell within reach.' },

  // GCS
  gcs_eyes:    { ar: 'فتح العينين', en: 'Eye Opening' },
  gcs_verbal:  { ar: 'الاستجابة الكلامية', en: 'Verbal Response' },
  gcs_motor:   { ar: 'الاستجابة الحركية', en: 'Motor Response' },
  gcs_e4: { ar: 'عفوياً', en: 'Spontaneous' },
  gcs_e3: { ar: 'عند نداء', en: 'To Speech' },
  gcs_e2: { ar: 'عند ألم', en: 'To Pain' },
  gcs_e1: { ar: 'لا استجابة', en: 'None' },
  gcs_v5: { ar: 'كلام مترابط', en: 'Oriented' },
  gcs_v4: { ar: 'كلام مشوش', en: 'Confused' },
  gcs_v3: { ar: 'كلمات غير مناسبة', en: 'Inappropriate Words' },
  gcs_v2: { ar: 'أصوات غير مفهومة', en: 'Incomprehensible' },
  gcs_v1: { ar: 'لا استجابة', en: 'None' },
  gcs_m6: { ar: 'يطيع الأوامر', en: 'Obeys Commands' },
  gcs_m5: { ar: 'يتموضع للألم', en: 'Localizes Pain' },
  gcs_m4: { ar: 'ينسحب من الألم', en: 'Withdrawal' },
  gcs_m3: { ar: 'انثناء غير طبيعي', en: 'Abnormal Flexion' },
  gcs_m2: { ar: 'بسط غير طبيعي', en: 'Extension' },
  gcs_m1: { ar: 'لا استجابة', en: 'None' },
  gcs_severe:   { ar: 'غيبوبة شديدة (≤8)', en: 'Severe (≤8)' },
  gcs_moderate: { ar: 'متوسط (9-12)', en: 'Moderate (9-12)' },
  gcs_mild:     { ar: 'خفيف (13-15)', en: 'Mild (13-15)' },
  gcs_severe_alert:  { ar: 'غيبوبة — GCS شديد!', en: 'Coma — Severe GCS!' },
  gcs_severe_action: { ar: 'أبلغ الطبيب فوراً. استعد للتدخل الطارئ.', en: 'Notify MD immediately. Prepare for emergency intervention.' },

  // Pain NRS
  pain_nrs:      { ar: 'مقياس الألم (0-10)', en: 'Pain Scale (NRS 0-10)' },
  pain_location: { ar: 'موقع الألم', en: 'Pain Location' },

  // ---- Fluid Balance ----
  fluid_balance_title:  { ar: 'الموازنة السائلة (الدخل والخرج)', en: 'Fluid Balance (I&O)' },
  fluid_intake:         { ar: 'إجمالي الدخل', en: 'Total Intake' },
  fluid_output:         { ar: 'إجمالي الخرج', en: 'Total Output' },
  fluid_balance:        { ar: 'الموازنة', en: 'Balance' },
  log_intake:           { ar: 'تسجيل دخل', en: 'Log Intake' },
  log_output:           { ar: 'تسجيل خرج', en: 'Log Output' },
  fluid_logged:         { ar: 'تم تسجيل السائل', en: 'Fluid logged' },
  amount_ml:            { ar: 'الكمية (مل)', en: 'Amount (mL)' },
  fluid_cat_iv_fluid:   { ar: 'سائل وريدي', en: 'IV Fluid' },
  fluid_cat_oral:       { ar: 'فموي', en: 'Oral' },
  fluid_cat_tube_feeding: { ar: 'تغذية بأنبوب', en: 'Tube Feeding' },
  fluid_cat_blood_products: { ar: 'منتجات دموية', en: 'Blood Products' },
  fluid_cat_other_intake: { ar: 'دخل آخر', en: 'Other Intake' },
  fluid_cat_urine:      { ar: 'بول', en: 'Urine' },
  fluid_cat_drain:      { ar: 'تصريف', en: 'Drain' },
  fluid_cat_wound:      { ar: 'إفراز جرح', en: 'Wound Drainage' },
  fluid_cat_emesis:     { ar: 'قيء', en: 'Emesis' },
  fluid_cat_blood_loss: { ar: 'نزيف', en: 'Blood Loss' },
  fluid_cat_other_output: { ar: 'خرج آخر', en: 'Other Output' },
  shift_morning:        { ar: 'مناوبة الصباح (7ص-3م)', en: 'Morning Shift (7am-3pm)' },
  shift_evening:        { ar: 'مناوبة المساء (3م-11م)', en: 'Evening Shift (3pm-11pm)' },
  shift_night:          { ar: 'مناوبة الليل (11م-7ص)', en: 'Night Shift (11pm-7am)' },

  // ---- Order Sets ----
  order_sets_title:     { ar: 'بروتوكولات العلاج', en: 'Order Sets / Clinical Protocols' },
  order_sets_hint:      { ar: 'اختر بروتوكولاً لتطبيق مجموعة الفحوصات والأدوية والمهام دفعة واحدة', en: 'Select a protocol to apply labs, meds, and tasks in one click' },
  apply_btn:            { ar: 'تطبيق', en: 'Apply' },
  confirm_apply_set:    { ar: 'تأكيد تطبيق البروتوكول', en: 'Confirm Apply Protocol' },
  confirm_btn:          { ar: 'تأكيد التطبيق', en: 'Confirm & Apply' },

  // ---- SBAR Handoff Checklist ----
  handoff_checklist:    { ar: 'قائمة تسليم المناوبة', en: 'Shift Handoff Checklist' },
  handoff_checklist_hint: { ar: 'يجب التحقق من جميع البنود قبل إرسال ملاحظات التسليم', en: 'All items must be confirmed before submitting handoff notes' },
  sbar_chk_vitals:      { ar: '✓ تم قياس العلامات الحيوية لجميع المرضى في هذه المناوبة', en: '✓ Vitals recorded for all assigned patients this shift' },
  sbar_chk_meds:        { ar: '✓ تم إعطاء جميع الأدوية المجدولة أو تم توثيق أسباب التأخير', en: '✓ All scheduled medications given or delay documented' },
  sbar_chk_pending:     { ar: '✓ تم توضيح جميع الفحوصات والمهام المعلقة للمناوبة القادمة', en: '✓ All pending tasks/labs communicated to incoming nurse' },
  sbar_chk_alerts:      { ar: '✓ تم إبلاغ الطبيب بأي تغييرات في الحالة أو نتائج حرجة', en: '✓ MD notified of any status changes or critical results' },
  sbar_chk_family:      { ar: '✓ تم التواصل مع الأسرة إذا لزم الأمر', en: '✓ Family communication done if required' },

  // ---- Pre-Discharge Checklist ----
  pre_discharge_checklist: { ar: 'قائمة التحقق قبل الخروج', en: 'Pre-Discharge Checklist' },
  pre_discharge_hint:      { ar: 'يجب اكتمال جميع البنود قبل إتمام إجراءات الخروج', en: 'All items must be complete before finalizing discharge' },
  dc_chk_diagnosis:     { ar: '✓ تم توثيق التشخيص النهائي', en: '✓ Final diagnosis documented' },
  dc_chk_meds:          { ar: '✓ قائمة أدوية الخروج مُعدّة وشُرحت للمريض', en: '✓ Discharge medication list prepared and explained to patient' },
  dc_chk_followup:      { ar: '✓ تم ترتيب موعد المتابعة', en: '✓ Follow-up appointment scheduled' },
  dc_chk_education:     { ar: '✓ تم تثقيف المريض والأسرة حول الرعاية المنزلية', en: '✓ Patient/family educated on home care and warning signs' },
  dc_chk_referrals:     { ar: '✓ تمت الإحالات اللازمة (إذا لزم الأمر)', en: '✓ Referrals completed if required' },
  dc_chk_transport:     { ar: '✓ تم ترتيب وسيلة نقل المريض', en: '✓ Transport arranged' },

  // ---- Communicable diseases & HAI ----
  communicable_diseases:    { ar: 'الأمراض المعدية', en: 'Communicable Diseases' },
  communicable_diseases_hint: { ar: 'الأمراض التي تستوجب احتياطات العزل أو الإبلاغ الوبائي', en: 'Diseases requiring isolation precautions or epidemiological reporting' },
  nosocomial_infections:    { ar: 'العدوى المكتسبة من المستشفى (HAI)', en: 'Hospital-Acquired Infections (HAI)' },
  add_nosocomial:           { ar: '+ تسجيل عدوى مكتسبة', en: '+ Record HAI' },
  hai_infection_type:       { ar: 'نوع العدوى', en: 'Infection Type' },
  hai_pathogen:             { ar: 'الجرثومة المسببة', en: 'Causative Pathogen' },
  hai_isolated:             { ar: 'تم عزل المريض', en: 'Patient Isolated' },
  hai_treatment:            { ar: 'العلاج الممنوح', en: 'Treatment Given' },
  no_nosocomial:            { ar: 'لا توجد عدوى مكتسبة مسجّلة', en: 'No recorded hospital-acquired infections' },

  // ---- Emergency contact (structured) ----
  ec_name:              { ar: 'اسم جهة الاتصال', en: 'Contact Name' },
  ec_phone:             { ar: 'هاتف جهة الاتصال', en: 'Contact Phone' },
  ec_relation:          { ar: 'صلة القرابة', en: 'Relationship' },

  // ---- Discharge transport person ----
  dc_transport_person:  { ar: 'بيانات مرافق الخروج', en: 'Discharge Transport Person' },
  dc_transport_name:    { ar: 'اسم الشخص المستلِم', en: 'Receiving Person Name' },
  dc_transport_phone:   { ar: 'هاتف الشخص المستلِم', en: 'Receiving Person Phone' },
  dc_transport_relation:{ ar: 'الصلة بالمريض', en: 'Relation to Patient' },

  // ---- IT Admin tabs ----
  hospital_staff:       { ar: 'موظفو المستشفى', en: 'Hospital Staff' },
  patient_accounts:     { ar: 'حسابات المرضى', en: 'Patient Accounts' },
  portal_status:        { ar: 'حالة البوابة', en: 'Portal Status' },
  portal_enabled_lbl:   { ar: 'مفعّلة', en: 'Enabled' },
  portal_disabled_lbl:  { ar: 'موقوفة', en: 'Disabled' },

  // ---- QR / NFC ----
  scan_qr:              { ar: 'مسح رمز QR', en: 'Scan QR Code' },
  write_nfc:            { ar: 'كتابة على سوار NFC', en: 'Write NFC Wristband' },
  read_nfc:             { ar: 'قراءة سوار NFC', en: 'Read NFC Wristband' },
  nfc_not_supported:    { ar: 'NFC غير مدعوم في هذا الجهاز', en: 'NFC not supported on this device' },
  nfc_writing:          { ar: 'جارٍ الكتابة على السوار...', en: 'Writing to wristband...' },
  nfc_reading:          { ar: 'قرّب السوار من الجهاز للقراءة...', en: 'Tap wristband to read...' },
  nfc_success:          { ar: 'تمت العملية بنجاح', en: 'NFC operation successful' },
  qr_scan_hint:         { ar: 'وجّه الكاميرا نحو رمز QR الخاص بالمريض', en: 'Point camera at patient QR code' },

  // ---- Cardiology tests ----
  cardiology:           { ar: 'أمراض القلب', en: 'Cardiology' },

  // ---- Risk levels (generic) ----
  risk_high:            { ar: 'خطر عالٍ', en: 'High Risk' },
  risk_medium:          { ar: 'خطر متوسط', en: 'Medium Risk' },
  risk_low:             { ar: 'خطر منخفض', en: 'Low Risk' },
  risk_normal:          { ar: 'طبيعي', en: 'Normal' },
};

// ---- Diet Codes ----
const DIET_CODES = {
  REG:    { ar: 'وجبة عادية',              en: 'Regular Diet',            desc_ar: 'وجبات متوازنة بدون قيود', desc_en: 'Balanced meals, no restrictions' },
  DM:     { ar: 'وجبة لمرضى السكر',        en: 'Diabetic Diet',           desc_ar: 'بدون سكر، بدون حلويات، كربوهيدرات محسوبة، وجبات صغيرة متكررة', desc_en: 'No sugar, no sweets, controlled carbs, small frequent meals' },
  LS:     { ar: 'قليل الملح',              en: 'Low Sodium',              desc_ar: 'بدون ملح مضاف، أقل من 2000 ملغ صوديوم/يوم', desc_en: 'No added salt, <2000mg sodium/day' },
  'DM+LS':{ ar: 'سكر + قليل الملح',        en: 'Diabetic + Low Sodium',    desc_ar: 'بدون سكر وبدون ملح', desc_en: 'No sugar AND no salt' },
  REN:    { ar: 'وجبة الكلى',              en: 'Renal Diet',              desc_ar: 'قليل البوتاسيوم والفوسفور، سوائل محدودة. بدون موز أو برتقال أو مكسرات أو ألبان', desc_en: 'Low potassium, low phosphorus, fluid restricted. No bananas, oranges, nuts, dairy' },
  DLY:    { ar: 'وجبة غسيل الكلى',         en: 'Dialysis Diet',           desc_ar: 'بروتين عالي، معادن محددة لمرضى غسيل الكلى', desc_en: 'Higher protein, specific minerals for dialysis patients' },
  CAR:    { ar: 'وجبة القلب',              en: 'Cardiac Diet',            desc_ar: 'قليل الدهون والصوديوم، بدون مقليات، بدون كافيين', desc_en: 'Low fat, low sodium, no fried, no caffeine' },
  HEP:    { ar: 'وجبة الكبد',              en: 'Hepatic Diet',            desc_ar: 'بروتين قليل (إذا كان هناك خطر اعتلال دماغي)، سهل الهضم', desc_en: 'Low protein (if encephalopathy risk), easy to digest' },
  LF:     { ar: 'قليل الدهون',             en: 'Low Fat',                 desc_ar: 'أقل من 50 جم دهون/يوم، بدون مقليات', desc_en: '<50g fat/day, no fried foods' },
  HF:     { ar: 'غني بالألياف',            en: 'High Fiber',              desc_ar: 'فواكه وخضروات وحبوب كاملة وماء كثير', desc_en: 'Fruits, vegetables, whole grains, lots of water' },
  HP:     { ar: 'غني بالبروتين',           en: 'High Protein',            desc_ar: 'بروتين إضافي للشفاء — حروق، سوء تغذية، بعد الجراحة', desc_en: 'Extra protein for healing — burns, malnutrition, post-surgery' },
  LP:     { ar: 'قليل البروتين',           en: 'Low Protein',             desc_ar: 'حد أدنى من اللحوم والألبان — حالات كلوية أو كبدية شديدة', desc_en: 'Minimal meat, minimal dairy — severe renal or hepatic cases' },
  SOFT:   { ar: 'وجبة طرية',              en: 'Soft Diet',               desc_ar: 'أطعمة مطبوخة وطرية فقط. بدون أطعمة صلبة أو نيئة أو مقرمشة', desc_en: 'Cooked, tender foods only. No hard, raw, or crunchy' },
  PUR:    { ar: 'وجبة مهروسة',             en: 'Pureed Diet',             desc_ar: 'كل شيء مخلوط ناعم. بدون مضغ', desc_en: 'Everything blended smooth. Nothing to chew' },
  FL:     { ar: 'سوائل كاملة',            en: 'Full Liquid',             desc_ar: 'حليب، زبادي، شوربة، عصائر، بودينغ. بدون قطع صلبة', desc_en: 'Milk, yogurt, soup, smoothies, pudding. No solid pieces' },
  CL:     { ar: 'سوائل صافية',            en: 'Clear Liquid',            desc_ar: 'ماء، مرق، جيلو، عصير تفاح فقط', desc_en: 'Water, broth, jello, apple juice only' },
  NPO:    { ar: 'ممنوع الأكل والشرب',      en: 'NPO — Nothing by Mouth',   desc_ar: 'ممنوع أي أكل أو شرب بالفم. سوائل وريدية فقط. تنبيه المطبخ', desc_en: 'NO food, NO water by mouth. IV fluids only. ALERT KITCHEN' },
  TF:     { ar: 'تغذية عبر أنبوب',         en: 'Tube Feeding',            desc_ar: 'المريض لا يستطيع الأكل. تغذية عبر أنبوب أنفي معدي أو PEG', desc_en: 'Patient cannot eat. Formula through NG tube or PEG' },
  PED:    { ar: 'وجبة أطفال',              en: 'Pediatric',               desc_ar: 'مناسبة للعمر. بدون حار. قوام طري لمن هم أقل من 5 سنوات', desc_en: 'Age-appropriate. No spicy. Soft textures for under 5' },
  LAC:    { ar: 'خالي من اللاكتوز',        en: 'Lactose-Free',            desc_ar: 'بدون حليب، بدون منتجات ألبان', desc_en: 'No milk, no dairy products' },
  GF:     { ar: 'خالي من الجلوتين',        en: 'Gluten-Free',             desc_ar: 'بدون قمح، بدون خبز، بدون معكرونة', desc_en: 'No wheat, no bread, no pasta' },
  CUSTOM: { ar: 'تعليمات الطبيب',          en: "Doctor's Custom Order",    desc_ar: 'اتبع تعليمات الطبيب المكتوبة بالضبط', desc_en: "Follow doctor's written instructions exactly" },
};

// Role map for easy lookup
// OpenSmile — dental clinic roles (collapsed from the 15 hospital roles).
const ROLES = {
  it_admin:         { ar: 'مدير النظام',                  en: 'IT Admin' },
  clinic_manager:   { ar: 'مدير العيادة',                 en: 'Clinic Manager' },
  dentist:          { ar: 'طبيب أسنان',                   en: 'Dentist' },
  specialist:       { ar: 'أخصائي أسنان',                 en: 'Dental Specialist' },
  hygienist:        { ar: 'مساعد / أخصائي صحة الأسنان',    en: 'Dental Assistant / Hygienist' },
  receptionist:     { ar: 'موظف استقبال',                 en: 'Receptionist' },
  patient:          { ar: 'بوابة المرضى',                 en: 'Patient Portal' },
};

// Common condition labels
const CONDITIONS = {
  diabetes_t1:    { ar: 'سكري نوع 1',              en: 'Type 1 Diabetes' },
  diabetes_t2:    { ar: 'سكري نوع 2',              en: 'Type 2 Diabetes' },
  hypertension:   { ar: 'ارتفاع ضغط الدم (HTN)',    en: 'Hypertension (HTN)' },
  cardiac:        { ar: 'مرض قلبي',                en: 'Cardiac Disease' },
  heart_failure:  { ar: 'قصور القلب',               en: 'Heart Failure' },
  afib:           { ar: 'رجفان أذيني',              en: 'Atrial Fibrillation' },
  renal_failure:  { ar: 'فشل كلوي',                en: 'Renal Failure' },
  ckd:            { ar: 'مرض كلوي مزمن',            en: 'Chronic Kidney Disease' },
  liver_disease:  { ar: 'مرض كبدي',                en: 'Liver Disease' },
  copd:           { ar: 'انسداد رئوي مزمن',          en: 'COPD' },
  asthma:         { ar: 'ربو',                     en: 'Asthma' },
  cancer:         { ar: 'سرطان',                   en: 'Cancer' },
  stroke_history: { ar: 'تاريخ سكتة دماغية',         en: 'History of Stroke' },
  dvt_pe:         { ar: 'تاريخ جلطة وريدية / انصمام', en: 'DVT / PE History' },
  obesity:        { ar: 'سمنة',                    en: 'Obesity' },
  thyroid:        { ar: 'اضطراب الغدة الدرقية',      en: 'Thyroid Disorder' },
  epilepsy:       { ar: 'صرع',                     en: 'Epilepsy' },
  mental_health:  { ar: 'مرض نفسي',                en: 'Mental Health Disorder' },
  other:          { ar: 'أخرى',                    en: 'Other' },
};

const COMMUNICABLE_DISEASES = {
  hiv:         { ar: 'فيروس نقص المناعة البشري (HIV/AIDS)', en: 'HIV/AIDS' },
  hepatitis_b: { ar: 'التهاب الكبد الفيروسي B (HBV)', en: 'Hepatitis B (HBV)' },
  hepatitis_c: { ar: 'التهاب الكبد الفيروسي C (HCV)', en: 'Hepatitis C (HCV)' },
  tuberculosis:{ ar: 'السل الرئوي (TB)',             en: 'Tuberculosis (TB)' },
  covid19:     { ar: 'كوفيد-19',                   en: 'COVID-19' },
  mrsa:        { ar: 'MRSA — عدوى مقاومة للميثيسيلين', en: 'MRSA' },
  vre:         { ar: 'VRE — مكورات معوية مقاومة',   en: 'VRE' },
  c_diff:      { ar: 'المطثية العسيرة (C. difficile)', en: 'C. difficile' },
  influenza:   { ar: 'الإنفلونزا',                 en: 'Influenza' },
  meningitis:  { ar: 'التهاب السحايا',              en: 'Meningitis' },
  malaria:     { ar: 'الملاريا',                   en: 'Malaria' },
  typhoid:     { ar: 'حمى التيفوئيد',              en: 'Typhoid Fever' },
  dengue:      { ar: 'حمى الضنك',                 en: 'Dengue Fever' },
  scabies:     { ar: 'الجرب',                      en: 'Scabies' },
};

const NOSOCOMIAL_TYPES = {
  cauti:  { ar: 'عدوى المسالك البولية (CAUTI)', en: 'Catheter-Associated UTI (CAUTI)' },
  clabsi: { ar: 'عدوى الدم المرتبطة بالقسطرة (CLABSI)', en: 'CLABSI (Central Line)' },
  vap:    { ar: 'الالتهاب الرئوي المرتبط بالتنفس الاصطناعي (VAP)', en: 'Ventilator-Associated Pneumonia (VAP)' },
  ssi:    { ar: 'عدوى موضع الجراحة (SSI)', en: 'Surgical Site Infection (SSI)' },
  cdiff:  { ar: 'إسهال المطثية العسيرة', en: 'C. difficile Diarrhea' },
  mrsa_hai: { ar: 'MRSA مكتسب من المستشفى', en: 'Hospital-Acquired MRSA' },
  pressure_ulcer: { ar: 'قرحة ضغط ناجمة عن الإقامة', en: 'Pressure Ulcer (Hospital-Acquired)' },
  phlebitis: { ar: 'التهاب وريد (في موضع الإبرة)', en: 'Phlebitis (IV Site)' },
  other_hai: { ar: 'عدوى مكتسبة أخرى', en: 'Other HAI' },
};

// Comprehensive Lab Test & Radiology Catalog
const LAB_TEST_CATALOG = [
  // ═══ BLOOD > HEMATOLOGY ═══
  { code:'CBC',   cat:'blood', sub:'hematology', name_en:'Complete Blood Count (CBC)', name_ar:'تحليل دم شامل (CBC)', specimen:'blood', container:'EDTA (Purple)', prep_en:'No special preparation', prep_ar:'لا يحتاج تحضير', hours:2,
    components:[{en:'WBC',ar:'كريات بيضاء',unit:'x10³/µL',ref:'4.5-11.0'},{en:'RBC',ar:'كريات حمراء',unit:'x10⁶/µL',ref:'4.5-5.5'},{en:'Hemoglobin',ar:'هيموغلوبين',unit:'g/dL',ref:'13.5-17.5'},{en:'Hematocrit',ar:'هيماتوكريت',unit:'%',ref:'38-50'},{en:'Platelets',ar:'صفائح دموية',unit:'x10³/µL',ref:'150-400'},{en:'MCV',ar:'حجم الكرية',unit:'fL',ref:'80-100'}]},
  { code:'DIFF',  cat:'blood', sub:'hematology', name_en:'WBC Differential', name_ar:'تفصيلة كريات الدم البيضاء', specimen:'blood', container:'EDTA (Purple)', prep_en:'', prep_ar:'', hours:2 },
  { code:'RETIC', cat:'blood', sub:'hematology', name_en:'Reticulocyte Count', name_ar:'عد الخلايا الشبكية', specimen:'blood', container:'EDTA (Purple)', prep_en:'', prep_ar:'', hours:4 },
  { code:'ESR',   cat:'blood', sub:'hematology', name_en:'ESR (Sedimentation Rate)', name_ar:'سرعة الترسيب (ESR)', specimen:'blood', container:'Citrate (Black)', prep_en:'', prep_ar:'', hours:2 },
  { code:'PBS',   cat:'blood', sub:'hematology', name_en:'Peripheral Blood Smear', name_ar:'مسحة دم محيطية', specimen:'blood', container:'EDTA (Purple)', prep_en:'', prep_ar:'', hours:4 },
  { code:'G6PD',  cat:'blood', sub:'hematology', name_en:'G6PD Screen', name_ar:'فحص G6PD', specimen:'blood', container:'EDTA (Purple)', prep_en:'', prep_ar:'', hours:24 },

  // ═══ BLOOD > COAGULATION ═══
  { code:'PT_INR', cat:'blood', sub:'coagulation', name_en:'PT / INR', name_ar:'وقت البروثرومبين / INR', specimen:'blood', container:'Citrate (Blue)', prep_en:'Note current anticoagulant medications', prep_ar:'سجل أدوية التخثر الحالية', hours:2,
    components:[{en:'PT',ar:'PT',unit:'sec',ref:'11-13.5'},{en:'INR',ar:'INR',unit:'',ref:'0.8-1.2'}]},
  { code:'PTT',   cat:'blood', sub:'coagulation', name_en:'aPTT', name_ar:'PTT', specimen:'blood', container:'Citrate (Blue)', prep_en:'', prep_ar:'', hours:2 },
  { code:'FIBR',  cat:'blood', sub:'coagulation', name_en:'Fibrinogen', name_ar:'فايبرينوجين', specimen:'blood', container:'Citrate (Blue)', prep_en:'', prep_ar:'', hours:4 },
  { code:'DDIM',  cat:'blood', sub:'coagulation', name_en:'D-Dimer', name_ar:'D-Dimer', specimen:'blood', container:'Citrate (Blue)', prep_en:'', prep_ar:'', hours:2 },

  // ═══ BLOOD > CHEMISTRY BASIC ═══
  { code:'BMP',   cat:'blood', sub:'chemistry_basic', name_en:'Basic Metabolic Panel (BMP)', name_ar:'أملاح ووظائف الكلى (BMP)', specimen:'blood', container:'SST (Gold)', prep_en:'Fasting 8 hours preferred', prep_ar:'يفضل صيام 8 ساعات', hours:4 },
  { code:'CMP',   cat:'blood', sub:'chemistry_basic', name_en:'Comprehensive Metabolic Panel (CMP)', name_ar:'كيمياء شاملة (CMP)', specimen:'blood', container:'SST (Gold)', prep_en:'Fasting 8-12 hours required', prep_ar:'صيام 8-12 ساعة مطلوب', hours:4 },
  { code:'LYTE',  cat:'blood', sub:'chemistry_basic', name_en:'Electrolytes (Na, K, Cl, CO2)', name_ar:'أملاح الدم', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:2,
    components:[{en:'Sodium (Na)',ar:'صوديوم',unit:'mEq/L',ref:'136-145'},{en:'Potassium (K)',ar:'بوتاسيوم',unit:'mEq/L',ref:'3.5-5.1'},{en:'Chloride (Cl)',ar:'كلوريد',unit:'mEq/L',ref:'98-106'},{en:'CO2',ar:'ثاني أكسيد الكربون',unit:'mEq/L',ref:'23-29'}]},
  { code:'BUN',   cat:'blood', sub:'chemistry_basic', name_en:'Blood Urea Nitrogen (BUN)', name_ar:'يوريا الدم', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:2 },
  { code:'CR',    cat:'blood', sub:'chemistry_basic', name_en:'Creatinine', name_ar:'كرياتينين', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:2 },
  { code:'GLUC',  cat:'blood', sub:'chemistry_basic', name_en:'Glucose (Random)', name_ar:'سكر عشوائي', specimen:'blood', container:'Fluoride (Gray)', prep_en:'', prep_ar:'', hours:1 },
  { code:'FBS',   cat:'blood', sub:'chemistry_basic', name_en:'Fasting Blood Sugar (FBS)', name_ar:'سكر صائم (FBS)', specimen:'blood', container:'Fluoride (Gray)', prep_en:'Patient must fast 8-12 hours. No food, juice, or sweetened drinks. Water only.', prep_ar:'المريض يجب أن يصوم 8-12 ساعة. ممنوع الأكل والعصير والمشروبات المحلاة. الماء فقط.', hours:1 },
  { code:'CA',    cat:'blood', sub:'chemistry_basic', name_en:'Calcium', name_ar:'كالسيوم', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:2 },
  { code:'MG',    cat:'blood', sub:'chemistry_basic', name_en:'Magnesium', name_ar:'مغنيسيوم', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:2 },
  { code:'PHOS',  cat:'blood', sub:'chemistry_basic', name_en:'Phosphate', name_ar:'فوسفات', specimen:'blood', container:'SST (Gold)', prep_en:'Fasting preferred', prep_ar:'يفضل الصيام', hours:2 },
  { code:'URIC',  cat:'blood', sub:'chemistry_basic', name_en:'Uric Acid', name_ar:'حمض اليوريك', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:4 },

  // ═══ BLOOD > CHEMISTRY METABOLIC ═══
  { code:'HBA1C', cat:'blood', sub:'chemistry_metabolic', name_en:'HbA1c (Glycated Hemoglobin)', name_ar:'السكر التراكمي (HbA1c)', specimen:'blood', container:'EDTA (Purple)', prep_en:'No fasting required', prep_ar:'لا يحتاج صيام', hours:4 },
  { code:'LIPID', cat:'blood', sub:'chemistry_metabolic', name_en:'Lipid Panel', name_ar:'دهون الدم', specimen:'blood', container:'SST (Gold)', prep_en:'Fasting 9-12 hours recommended', prep_ar:'يوصى بالصيام 9-12 ساعة', hours:4,
    components:[{en:'Total Cholesterol',ar:'كوليسترول كلي',unit:'mg/dL',ref:'<200'},{en:'HDL',ar:'HDL',unit:'mg/dL',ref:'>40'},{en:'LDL',ar:'LDL',unit:'mg/dL',ref:'<100'},{en:'Triglycerides',ar:'دهون ثلاثية',unit:'mg/dL',ref:'<150'}]},
  { code:'TFT',   cat:'blood', sub:'chemistry_metabolic', name_en:'Thyroid Function (TSH, Free T4)', name_ar:'وظائف الغدة الدرقية', specimen:'blood', container:'SST (Gold)', prep_en:'Morning sample preferred', prep_ar:'يفضل عينة صباحية', hours:4,
    components:[{en:'TSH',ar:'TSH',unit:'mIU/L',ref:'0.27-4.2'},{en:'Free T4',ar:'T4 حر',unit:'ng/dL',ref:'0.93-1.7'}]},
  { code:'VIT_D', cat:'blood', sub:'chemistry_metabolic', name_en:'Vitamin D (25-OH)', name_ar:'فيتامين د', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:24 },
  { code:'B12',   cat:'blood', sub:'chemistry_metabolic', name_en:'Vitamin B12', name_ar:'فيتامين ب12', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:24 },
  { code:'FOLATE',cat:'blood', sub:'chemistry_metabolic', name_en:'Folate', name_ar:'حمض الفوليك', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:24 },
  { code:'IRON',  cat:'blood', sub:'chemistry_metabolic', name_en:'Iron Studies (Fe, TIBC, Ferritin)', name_ar:'دراسة الحديد', specimen:'blood', container:'SST (Gold)', prep_en:'Fasting, morning sample preferred', prep_ar:'صيام، يفضل عينة صباحية', hours:4 },
  { code:'ALB',   cat:'blood', sub:'chemistry_metabolic', name_en:'Albumin', name_ar:'ألبومين', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:2 },
  { code:'OGTT',  cat:'blood', sub:'chemistry_metabolic', name_en:'Oral Glucose Tolerance Test (OGTT)', name_ar:'اختبار تحمل السكر', specimen:'blood', container:'Fluoride (Gray)', prep_en:'Fast overnight. 75g glucose load given. Samples at 0, 1, 2 hours.', prep_ar:'صيام ليلة كاملة. يعطى 75 غم جلوكوز. عينات عند 0، 1، 2 ساعة.', hours:4 },

  // ═══ BLOOD > LIVER ═══
  { code:'LFT',   cat:'blood', sub:'chemistry_liver', name_en:'Liver Function Tests (LFT)', name_ar:'وظائف الكبد (LFT)', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:4,
    components:[{en:'ALT (SGPT)',ar:'ALT',unit:'U/L',ref:'7-56'},{en:'AST (SGOT)',ar:'AST',unit:'U/L',ref:'10-40'},{en:'ALP',ar:'ALP',unit:'U/L',ref:'44-147'},{en:'Total Bilirubin',ar:'بيليروبين كلي',unit:'mg/dL',ref:'0.1-1.2'},{en:'Direct Bilirubin',ar:'بيليروبين مباشر',unit:'mg/dL',ref:'0-0.3'},{en:'GGT',ar:'GGT',unit:'U/L',ref:'9-48'},{en:'Albumin',ar:'ألبومين',unit:'g/dL',ref:'3.5-5.5'}]},
  { code:'AMMO',  cat:'blood', sub:'chemistry_liver', name_en:'Ammonia', name_ar:'أمونيا', specimen:'blood', container:'EDTA (Purple)', prep_en:'Keep on ice. Transport immediately to lab.', prep_ar:'يحفظ على الثلج. ينقل للمختبر فوراً.', hours:1 },

  // ═══ BLOOD > RENAL ═══
  { code:'RFT',   cat:'blood', sub:'chemistry_renal', name_en:'Renal Function Tests (RFT)', name_ar:'وظائف الكلى (RFT)', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:4,
    components:[{en:'BUN',ar:'يوريا',unit:'mg/dL',ref:'7-20'},{en:'Creatinine',ar:'كرياتينين',unit:'mg/dL',ref:'0.7-1.3'},{en:'eGFR',ar:'معدل الترشيح',unit:'mL/min',ref:'>90'}]},

  // ═══ BLOOD > CARDIAC ═══
  { code:'TROP',  cat:'blood', sub:'chemistry_cardiac', name_en:'Troponin I/T', name_ar:'تروبونين', specimen:'blood', container:'SST (Gold)', prep_en:'STAT. Repeat at 3h and 6h if initial negative.', prep_ar:'طارئ. يُعاد بعد 3 و 6 ساعات إذا كانت النتيجة الأولى سلبية.', hours:1 },
  { code:'CKMB',  cat:'blood', sub:'chemistry_cardiac', name_en:'CK-MB', name_ar:'CK-MB', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:2 },
  { code:'BNP',   cat:'blood', sub:'chemistry_cardiac', name_en:'BNP / NT-proBNP', name_ar:'BNP (مؤشر فشل القلب)', specimen:'blood', container:'EDTA (Purple)', prep_en:'', prep_ar:'', hours:2 },
  { code:'CK',    cat:'blood', sub:'chemistry_cardiac', name_en:'Creatine Kinase (CK)', name_ar:'كرياتين كاينيز', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:2 },
  { code:'LDH',   cat:'blood', sub:'chemistry_cardiac', name_en:'LDH', name_ar:'LDH', specimen:'blood', container:'SST (Gold)', prep_en:'Avoid hemolysis', prep_ar:'تجنب انحلال الدم', hours:4 },

  // ═══ BLOOD > INFLAMMATORY ═══
  { code:'CRP',   cat:'blood', sub:'chemistry_inflammatory', name_en:'C-Reactive Protein (CRP)', name_ar:'بروتين سي التفاعلي (CRP)', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:2 },
  { code:'PCT',   cat:'blood', sub:'chemistry_inflammatory', name_en:'Procalcitonin', name_ar:'بروكالسيتونين', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:4 },
  { code:'LACT',  cat:'blood', sub:'chemistry_inflammatory', name_en:'Lactate', name_ar:'لاكتات', specimen:'blood', container:'Fluoride (Gray)', prep_en:'Do NOT use tourniquet excessively. Keep on ice.', prep_ar:'لا تستخدم الرباط بشكل مفرط. يحفظ على الثلج.', hours:1 },
  { code:'FERR',  cat:'blood', sub:'chemistry_inflammatory', name_en:'Ferritin', name_ar:'فيريتين', specimen:'blood', container:'SST (Gold)', prep_en:'Also elevated in inflammation', prep_ar:'يرتفع أيضاً في حالات الالتهاب', hours:4 },

  // ═══ BLOOD > BLOOD GAS ═══
  { code:'ABG',   cat:'blood', sub:'blood_gas', name_en:'Arterial Blood Gas (ABG)', name_ar:'غازات الدم الشرياني (ABG)', specimen:'arterial_blood', container:'Heparin Syringe', prep_en:'Note FiO2 and ventilator settings. Heparinized syringe. Transport on ice immediately.', prep_ar:'سجل نسبة الأكسجين وإعدادات جهاز التنفس. سرنجة هيبارين. ينقل على الثلج فوراً.', hours:0.5,
    components:[{en:'pH',ar:'pH',unit:'',ref:'7.35-7.45'},{en:'pCO2',ar:'pCO2',unit:'mmHg',ref:'35-45'},{en:'pO2',ar:'pO2',unit:'mmHg',ref:'80-100'},{en:'HCO3',ar:'بيكربونات',unit:'mEq/L',ref:'22-26'},{en:'Base Excess',ar:'فائض القاعدة',unit:'mEq/L',ref:'-2 to +2'}]},
  { code:'VBG',   cat:'blood', sub:'blood_gas', name_en:'Venous Blood Gas (VBG)', name_ar:'غازات الدم الوريدي', specimen:'blood', container:'Heparin Syringe', prep_en:'', prep_ar:'', hours:0.5 },

  // ═══ BLOOD > BLOOD BANK ═══
  { code:'TS',    cat:'blood', sub:'blood_bank', name_en:'Type and Screen', name_ar:'فصيلة الدم والأجسام المضادة', specimen:'blood', container:'EDTA (Purple)', prep_en:'', prep_ar:'', hours:2 },
  { code:'XM',    cat:'blood', sub:'blood_bank', name_en:'Crossmatch', name_ar:'فحص توافق الدم', specimen:'blood', container:'EDTA (Purple)', prep_en:'Specify number of units needed', prep_ar:'حدد عدد الوحدات المطلوبة', hours:2 },
  { code:'COOMBS',cat:'blood', sub:'blood_bank', name_en:'Coombs Test (Direct/Indirect)', name_ar:'اختبار كومبس', specimen:'blood', container:'EDTA (Purple)', prep_en:'', prep_ar:'', hours:4 },

  // ═══ BLOOD > TUMOR MARKERS ═══
  { code:'PSA',   cat:'blood', sub:'tumor_markers', name_en:'PSA', name_ar:'مستضد البروستاتا', specimen:'blood', container:'SST (Gold)', prep_en:'Avoid DRE 48 hours before', prep_ar:'تجنب فحص المستقيم 48 ساعة قبل', hours:24 },
  { code:'CEA',   cat:'blood', sub:'tumor_markers', name_en:'CEA', name_ar:'CEA', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:24 },
  { code:'AFP',   cat:'blood', sub:'tumor_markers', name_en:'Alpha-Fetoprotein (AFP)', name_ar:'ألفا فيتوبروتين', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:24 },
  { code:'CA125', cat:'blood', sub:'tumor_markers', name_en:'CA-125', name_ar:'CA-125', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:24 },

  // ═══ BLOOD > THERAPEUTIC DRUG MONITORING ═══
  { code:'VANCO_LVL', cat:'blood', sub:'tdm', name_en:'Vancomycin Level', name_ar:'مستوى فانكوميسين', specimen:'blood', container:'SST (Gold)', prep_en:'Trough: draw 30 min before next dose', prep_ar:'القاع: يسحب 30 دقيقة قبل الجرعة التالية', hours:4 },
  { code:'GENTA_LVL', cat:'blood', sub:'tdm', name_en:'Gentamicin Level', name_ar:'مستوى جنتاميسين', specimen:'blood', container:'SST (Gold)', prep_en:'Trough: draw 30 min before next dose', prep_ar:'القاع: يسحب 30 دقيقة قبل الجرعة التالية', hours:4 },
  { code:'DIGOX_LVL', cat:'blood', sub:'tdm', name_en:'Digoxin Level', name_ar:'مستوى ديجوكسين', specimen:'blood', container:'SST (Gold)', prep_en:'Draw 6-8h post-dose', prep_ar:'يسحب بعد 6-8 ساعات من الجرعة', hours:4 },
  { code:'PHENY_LVL', cat:'blood', sub:'tdm', name_en:'Phenytoin Level', name_ar:'مستوى فينيتوين', specimen:'blood', container:'SST (Gold)', prep_en:'Trough level', prep_ar:'مستوى قاع', hours:4 },

  // ═══ URINE > URINALYSIS ═══
  { code:'UA',    cat:'urine', sub:'urinalysis', name_en:'Urinalysis (Dipstick + Microscopy)', name_ar:'تحليل بول شامل', specimen:'urine', container:'Urine Cup', prep_en:'Midstream clean-catch specimen', prep_ar:'عينة منتصف التبول بعد التنظيف', hours:2 },
  { code:'UPREG', cat:'urine', sub:'urinalysis', name_en:'Urine Pregnancy Test (hCG)', name_ar:'اختبار حمل (بول)', specimen:'urine', container:'Urine Cup', prep_en:'First morning void preferred', prep_ar:'يفضل أول عينة صباحية', hours:0.5 },

  // ═══ URINE > URINE CHEMISTRY ═══
  { code:'U24PROT', cat:'urine', sub:'urine_chemistry', name_en:'24-Hour Urine Protein', name_ar:'بروتين بول 24 ساعة', specimen:'urine_24h', container:'24h Jug', prep_en:'Collect ALL urine for 24 hours. Discard first void. Refrigerate collection.', prep_ar:'اجمع كل البول لمدة 24 ساعة. تخلص من أول تبول. برّد العينة.', hours:48 },
  { code:'UALB_CR', cat:'urine', sub:'urine_chemistry', name_en:'Urine Albumin/Creatinine Ratio', name_ar:'نسبة ألبومين/كرياتينين البول', specimen:'urine', container:'Urine Cup', prep_en:'Random spot urine', prep_ar:'عينة بول عشوائية', hours:4 },

  // ═══ MICROBIOLOGY > CULTURES ═══
  { code:'BCX',   cat:'microbiology', sub:'culture', name_en:'Blood Culture', name_ar:'مزرعة دم', specimen:'blood', container:'Blood Culture Bottles', prep_en:'Collect BEFORE starting antibiotics. Two sets from different sites. Aseptic technique critical.', prep_ar:'يجمع قبل بدء المضادات الحيوية. مجموعتان من موقعين مختلفين. تقنية معقمة ضرورية.', hours:72 },
  { code:'UCX',   cat:'microbiology', sub:'culture', name_en:'Urine Culture', name_ar:'مزرعة بول', specimen:'urine', container:'Sterile Cup', prep_en:'Midstream clean-catch. Catheter specimen if indicated.', prep_ar:'عينة منتصف التبول نظيفة. عينة قسطرة إذا لزم.', hours:48 },
  { code:'SPUTCX',cat:'microbiology', sub:'culture', name_en:'Sputum Culture', name_ar:'مزرعة بلغم', specimen:'sputum', container:'Sterile Container', prep_en:'Deep cough specimen. Early morning preferred.', prep_ar:'عينة سعال عميق. يفضل صباحاً باكراً.', hours:48 },
  { code:'WCX',   cat:'microbiology', sub:'culture', name_en:'Wound Culture', name_ar:'مزرعة جرح', specimen:'wound_swab', container:'Culturette Swab', prep_en:'Clean wound periphery first. Swab from base of wound.', prep_ar:'نظف محيط الجرح أولاً. امسح من قاعدة الجرح.', hours:48 },

  // ═══ MICROBIOLOGY > SEROLOGY ═══
  { code:'HIV',   cat:'microbiology', sub:'serology', name_en:'HIV Ab/Ag Screen', name_ar:'فحص فيروس نقص المناعة', specimen:'blood', container:'SST (Gold)', prep_en:'Requires patient consent', prep_ar:'يتطلب موافقة المريض', hours:24 },
  { code:'HBSAG', cat:'microbiology', sub:'serology', name_en:'Hepatitis B Surface Antigen', name_ar:'مستضد فيروس الكبد ب', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:24 },
  { code:'HCV',   cat:'microbiology', sub:'serology', name_en:'Hepatitis C Antibody', name_ar:'أجسام مضادة لفيروس الكبد سي', specimen:'blood', container:'SST (Gold)', prep_en:'', prep_ar:'', hours:24 },
  { code:'COVID', cat:'microbiology', sub:'serology', name_en:'COVID-19 PCR', name_ar:'فحص كوفيد-19 PCR', specimen:'np_swab', container:'VTM', prep_en:'Nasopharyngeal swab', prep_ar:'مسحة بلعوم أنفي', hours:8 },
  { code:'MALARIA',cat:'microbiology', sub:'serology', name_en:'Malaria Smear', name_ar:'مسحة ملاريا', specimen:'blood', container:'EDTA (Purple)', prep_en:'Thick and thin smear', prep_ar:'مسحة سميكة ورقيقة', hours:2 },

  // ═══ STOOL ═══
  { code:'STOOL_OB', cat:'stool', sub:'stool_analysis', name_en:'Stool Occult Blood (FOBT)', name_ar:'دم خفي في البراز', specimen:'stool', container:'Stool Container', prep_en:'Avoid red meat, vitamin C, NSAIDs 3 days before', prep_ar:'تجنب اللحوم الحمراء وفيتامين سي والمسكنات 3 أيام قبل', hours:4 },
  { code:'STOOL_GEN', cat:'stool', sub:'stool_analysis', name_en:'Stool General Exam (Ova & Parasites)', name_ar:'فحص براز عام (بيوض وطفيليات)', specimen:'stool', container:'Stool Container', prep_en:'Three samples on different days preferred', prep_ar:'يفضل ثلاث عينات في أيام مختلفة', hours:4 },
  { code:'CDIFF', cat:'stool', sub:'stool_analysis', name_en:'C. difficile Toxin', name_ar:'سم المطثية العسيرة', specimen:'stool', container:'Stool Container', prep_en:'', prep_ar:'', hours:8 },

  // ═══ CSF ═══
  { code:'CSF_GEN', cat:'csf', sub:'csf_analysis', name_en:'CSF Analysis (Protein, Glucose, Cell Count)', name_ar:'تحليل سائل النخاع الشوكي', specimen:'csf', container:'Sterile Tubes', prep_en:'Simultaneous blood glucose required', prep_ar:'يلزم تحليل سكر دم متزامن', hours:2 },

  // ═══ RADIOLOGY > X-RAY ═══
  { code:'CXR',   cat:'radiology', sub:'xray', name_en:'Chest X-Ray (PA/Lateral)', name_ar:'أشعة صدر', specimen:'imaging', container:'', prep_en:'Remove jewelry and metal. Pregnancy check for females of childbearing age.', prep_ar:'إزالة المجوهرات والمعادن. فحص حمل للإناث في سن الإنجاب.', hours:1 },
  { code:'AXR',   cat:'radiology', sub:'xray', name_en:'Abdominal X-Ray', name_ar:'أشعة بطن', specimen:'imaging', container:'', prep_en:'Remove belt and metal objects', prep_ar:'إزالة الحزام والأجسام المعدنية', hours:1 },
  { code:'KUB',   cat:'radiology', sub:'xray', name_en:'KUB (Kidneys, Ureters, Bladder)', name_ar:'أشعة KUB', specimen:'imaging', container:'', prep_en:'', prep_ar:'', hours:1 },
  { code:'CSPINE_XR', cat:'radiology', sub:'xray', name_en:'Cervical Spine X-Ray', name_ar:'أشعة فقرات عنقية', specimen:'imaging', container:'', prep_en:'Remove necklaces', prep_ar:'إزالة القلائد', hours:1 },
  { code:'LSPINE_XR', cat:'radiology', sub:'xray', name_en:'Lumbar Spine X-Ray', name_ar:'أشعة فقرات قطنية', specimen:'imaging', container:'', prep_en:'', prep_ar:'', hours:1 },
  { code:'HAND_XR',   cat:'radiology', sub:'xray', name_en:'Hand/Wrist X-Ray', name_ar:'أشعة يد/معصم', specimen:'imaging', container:'', prep_en:'Remove rings', prep_ar:'إزالة الخواتم', hours:1 },
  { code:'KNEE_XR',   cat:'radiology', sub:'xray', name_en:'Knee X-Ray', name_ar:'أشعة ركبة', specimen:'imaging', container:'', prep_en:'', prep_ar:'', hours:1 },
  { code:'SHOULDER_XR',cat:'radiology', sub:'xray', name_en:'Shoulder X-Ray', name_ar:'أشعة كتف', specimen:'imaging', container:'', prep_en:'', prep_ar:'', hours:1 },
  { code:'PELVIS_XR', cat:'radiology', sub:'xray', name_en:'Pelvis X-Ray', name_ar:'أشعة حوض', specimen:'imaging', container:'', prep_en:'Pregnancy check', prep_ar:'فحص حمل', hours:1 },
  { code:'FOOT_XR',   cat:'radiology', sub:'xray', name_en:'Foot/Ankle X-Ray', name_ar:'أشعة قدم/كاحل', specimen:'imaging', container:'', prep_en:'', prep_ar:'', hours:1 },

  // ═══ RADIOLOGY > ULTRASOUND ═══
  { code:'US_ABD',   cat:'radiology', sub:'ultrasound', name_en:'Abdominal Ultrasound', name_ar:'سونار بطن', specimen:'imaging', container:'', prep_en:'Patient must fast 6-8 hours. No food, no drinks except water.', prep_ar:'المريض يجب أن يصوم 6-8 ساعات. ممنوع الأكل والشرب ما عدا الماء.', hours:2 },
  { code:'US_PELV',  cat:'radiology', sub:'ultrasound', name_en:'Pelvic Ultrasound', name_ar:'سونار حوض', specimen:'imaging', container:'', prep_en:'Full bladder required. Drink 4-6 glasses of water 1 hour before. Do NOT empty bladder.', prep_ar:'المثانة الممتلئة مطلوبة. اشرب 4-6 أكواب ماء قبل ساعة. لا تفرغ المثانة.', hours:2 },
  { code:'US_REN',   cat:'radiology', sub:'ultrasound', name_en:'Renal Ultrasound', name_ar:'سونار كلى', specimen:'imaging', container:'', prep_en:'Fasting preferred', prep_ar:'يفضل الصيام', hours:2 },
  { code:'US_THY',   cat:'radiology', sub:'ultrasound', name_en:'Thyroid Ultrasound', name_ar:'سونار غدة درقية', specimen:'imaging', container:'', prep_en:'No preparation needed', prep_ar:'لا يحتاج تحضير', hours:2 },
  { code:'US_DVT',   cat:'radiology', sub:'ultrasound', name_en:'Lower Extremity Venous Doppler (DVT)', name_ar:'دوبلر أوردة الأطراف السفلية', specimen:'imaging', container:'', prep_en:'DVT screening. No preparation.', prep_ar:'فحص تجلط وريدي. لا يحتاج تحضير.', hours:2 },
  { code:'US_ECHO',  cat:'radiology', sub:'ultrasound', name_en:'Echocardiogram', name_ar:'إيكو القلب', specimen:'imaging', container:'', prep_en:'No preparation. Patient may need to lie on left side.', prep_ar:'لا يحتاج تحضير. قد يحتاج المريض للاستلقاء على الجانب الأيسر.', hours:2 },

  // ═══ RADIOLOGY > CT ═══
  { code:'CT_HEAD',  cat:'radiology', sub:'ct', name_en:'CT Head (non-contrast)', name_ar:'أشعة مقطعية للرأس (بدون صبغة)', specimen:'imaging', container:'', prep_en:'Remove earrings, hairpins. Check for pregnancy.', prep_ar:'إزالة الأقراط ودبابيس الشعر. فحص حمل.', hours:1 },
  { code:'CT_HEAD_C',cat:'radiology', sub:'ct', name_en:'CT Head with Contrast', name_ar:'أشعة مقطعية للرأس (بصبغة)', specimen:'imaging', container:'', prep_en:'Check creatinine/eGFR (must be >30). Allergy history to contrast. NPO 4 hours. Hydrate if borderline renal function.', prep_ar:'فحص كرياتينين/eGFR (يجب أن يكون >30). تاريخ حساسية الصبغة. صيام 4 ساعات. ترطيب إذا كانت وظائف الكلى حدية.', hours:2 },
  { code:'CT_CHEST', cat:'radiology', sub:'ct', name_en:'CT Chest', name_ar:'أشعة مقطعية للصدر', specimen:'imaging', container:'', prep_en:'Remove metal objects', prep_ar:'إزالة الأجسام المعدنية', hours:1 },
  { code:'CTPA',     cat:'radiology', sub:'ct', name_en:'CT Pulmonary Angiogram (CTPA)', name_ar:'أشعة مقطعية لشرايين الرئة', specimen:'imaging', container:'', prep_en:'Check renal function. Contrast required. Confirm no contrast allergy. NPO 4h.', prep_ar:'فحص وظائف الكلى. صبغة مطلوبة. تأكد من عدم وجود حساسية للصبغة. صيام 4 ساعات.', hours:2 },
  { code:'CT_ABD_C', cat:'radiology', sub:'ct', name_en:'CT Abdomen/Pelvis with Contrast', name_ar:'أشعة مقطعية للبطن والحوض (بصبغة)', specimen:'imaging', container:'', prep_en:'Check creatinine. NPO 4-6 hours. Oral contrast 1-2 hours before if ordered.', prep_ar:'فحص كرياتينين. صيام 4-6 ساعات. صبغة فموية قبل 1-2 ساعة إذا طُلبت.', hours:2 },

  // ═══ RADIOLOGY > MRI ═══
  { code:'MRI_BRAIN', cat:'radiology', sub:'mri', name_en:'MRI Brain', name_ar:'رنين مغناطيسي للدماغ', specimen:'imaging', container:'', prep_en:'Remove ALL metal. Screen for pacemaker, implants, metal foreign bodies. Claustrophobia assessment. Takes 30-45 min.', prep_ar:'إزالة كل المعادن. فحص لوجود منظم قلب أو زرعات أو أجسام معدنية. تقييم رهاب الأماكن المغلقة. يستغرق 30-45 دقيقة.', hours:4 },
  { code:'MRI_BRAIN_C',cat:'radiology', sub:'mri', name_en:'MRI Brain with Gadolinium', name_ar:'رنين مغناطيسي للدماغ (بصبغة)', specimen:'imaging', container:'', prep_en:'Same MRI safety screen. Check eGFR (gadolinium contraindicated if eGFR <30, risk of NSF).', prep_ar:'نفس فحص أمان الرنين. فحص eGFR (الجادولينيوم ممنوع إذا eGFR <30، خطر NSF).', hours:4 },
  { code:'MRI_SPINE', cat:'radiology', sub:'mri', name_en:'MRI Spine (C/T/L)', name_ar:'رنين مغناطيسي للعمود الفقري', specimen:'imaging', container:'', prep_en:'MRI safety screen required', prep_ar:'فحص أمان الرنين مطلوب', hours:4 },
  { code:'MRI_KNEE',  cat:'radiology', sub:'mri', name_en:'MRI Knee', name_ar:'رنين مغناطيسي للركبة', specimen:'imaging', container:'', prep_en:'MRI safety screen required', prep_ar:'فحص أمان الرنين مطلوب', hours:4 },

  // ═══ RADIOLOGY > NUCLEAR ═══
  { code:'BONE_SCAN', cat:'radiology', sub:'nuclear', name_en:'Bone Scan', name_ar:'مسح عظمي', specimen:'imaging', container:'', prep_en:'Injection 2-4 hours before imaging. Drink fluids. Void frequently.', prep_ar:'حقن قبل 2-4 ساعات من التصوير. اشرب سوائل. تبول بشكل متكرر.', hours:8 },
  { code:'VQ_SCAN',   cat:'radiology', sub:'nuclear', name_en:'V/Q Scan (Ventilation-Perfusion)', name_ar:'مسح التهوية والتروية', specimen:'imaging', container:'', prep_en:'Recent CXR needed. Check pregnancy.', prep_ar:'أشعة صدر حديثة مطلوبة. فحص حمل.', hours:4 },

  // ═══ CARDIOLOGY (رسم القلب وما يتعلق به) ═══
  { code:'ECG_12', cat:'cardiology', sub:'ecg', name_en:'12-Lead ECG (رسم القلب)', name_ar:'تخطيط القلب الكهربائي 12 اتجاه', specimen:'procedure', container:'', prep_en:'Patient should be supine and still. Remove chest jewelry. Avoid limb movement during acquisition.', prep_ar:'المريض مستلقٍ وغير متحرك. إزالة المجوهرات. تجنب حركة الأطراف.', hours:0.25,
    components:[
      {en:'Heart Rate',ar:'معدل القلب (bpm)',unit:'bpm',ref:'60-100'},
      {en:'Rhythm',ar:'النظم',unit:'',ref:'Sinus Rhythm'},
      {en:'PR Interval',ar:'مسافة PR',unit:'ms',ref:'120-200'},
      {en:'QRS Duration',ar:'مدة QRS',unit:'ms',ref:'<120'},
      {en:'QT / QTc',ar:'QT / QTc',unit:'ms',ref:'QTc <450 (M), <460 (F)'},
      {en:'QRS Axis',ar:'محور QRS (درجة)',unit:'°',ref:'-30 to +90'},
      {en:'ST Segment',ar:'قطعة ST',unit:'',ref:'Isoelectric'},
      {en:'T-wave',ar:'موجة T',unit:'',ref:'Upright in I,II,V2-V6'},
      {en:'Interpretation',ar:'التفسير الكلي',unit:'',ref:''},
    ]
  },
  { code:'ECG_SERIAL', cat:'cardiology', sub:'ecg', name_en:'Serial ECG (Repeat)', name_ar:'تخطيط القلب المتسلسل', specimen:'procedure', container:'', prep_en:'Compare with previous ECG. Document time.', prep_ar:'قارن مع تخطيط سابق. سجّل الوقت.', hours:0.25 },
  { code:'HOLTER_24',  cat:'cardiology', sub:'ecg', name_en:'Holter Monitor (24-Hour)', name_ar:'هولتر 24 ساعة', specimen:'procedure', container:'', prep_en:'Patient diary required. Avoid water. Mark symptom episodes. No MRI during monitoring.', prep_ar:'دفتر يومية المريض مطلوب. تجنب الماء. علّم على نوبات الأعراض.', hours:24 },
  { code:'HOLTER_48',  cat:'cardiology', sub:'ecg', name_en:'Holter Monitor (48-Hour)', name_ar:'هولتر 48 ساعة', specimen:'procedure', container:'', prep_en:'Patient diary required. Avoid bathing.', prep_ar:'دفتر يومية المريض مطلوب.', hours:48 },
  { code:'ECHO_TTE',   cat:'cardiology', sub:'echo', name_en:'Echocardiogram (TTE)', name_ar:'صدى القلب (TTE)', specimen:'procedure', container:'', prep_en:'No special preparation. Left lateral decubitus position.', prep_ar:'لا يحتاج تحضير. وضعية الجنب الأيسر.', hours:1,
    components:[
      {en:'EF (Ejection Fraction)',ar:'كسر القذف (EF)',unit:'%',ref:'>55%'},
      {en:'LV End-Diastolic Diameter',ar:'قطر البطين الأيسر الانبساطي',unit:'mm',ref:'42-59'},
      {en:'IVS Thickness',ar:'سماكة الحاجز البيني',unit:'mm',ref:'6-11'},
      {en:'LA Size',ar:'حجم الأذين الأيسر',unit:'mm',ref:'<40'},
      {en:'Aortic Root',ar:'جذر الأبهر',unit:'mm',ref:'<40'},
      {en:'Mitral Valve',ar:'الصمام التاجي',unit:'',ref:'Normal leaflet motion'},
      {en:'Pericardial Effusion',ar:'انصباب التامور',unit:'',ref:'None'},
      {en:'Wall Motion Abnormality',ar:'اضطراب حركة الجدار',unit:'',ref:'None'},
    ]
  },
  { code:'ECHO_TEE',   cat:'cardiology', sub:'echo', name_en:'Echocardiogram (TEE — Trans-esophageal)', name_ar:'صدى القلب عبر المريء (TEE)', specimen:'procedure', container:'', prep_en:'NPO 6 hours before. IV access required. Sedation/local anesthesia. Consent required.', prep_ar:'صيام 6 ساعات. وصول وريدي. مخدر موضعي. موافقة مطلوبة.', hours:1 },
  { code:'STRESS_ECG', cat:'cardiology', sub:'stress', name_en:'Exercise Stress Test (EST)', name_ar:'اختبار الجهد (رسم القلب بالجهد)', specimen:'procedure', container:'', prep_en:'No heavy meal 3h before. Wear comfortable shoes. Withhold beta-blockers if clinically appropriate. 12-lead ECG at rest, during, and after exercise.', prep_ar:'لا وجبة ثقيلة قبل 3 ساعات. ارتداء حذاء مريح. قد يوقف الطبيب حاصرات بيتا.', hours:2 },
  { code:'ABI',        cat:'cardiology', sub:'vascular', name_en:'Ankle-Brachial Index (ABI)', name_ar:'مؤشر الكاحل والعضد (ABI)', specimen:'procedure', container:'', prep_en:'Patient supine, resting 10 minutes before measurement.', prep_ar:'المريض مستلقٍ ومرتاح 10 دقائق قبل القياس.', hours:0.5,
    components:[
      {en:'Right ABI',ar:'ABI الأيمن',unit:'',ref:'0.9-1.3'},
      {en:'Left ABI',ar:'ABI الأيسر',unit:'',ref:'0.9-1.3'},
    ]
  },
  { code:'CAROTID_US', cat:'cardiology', sub:'vascular', name_en:'Carotid Ultrasound (IMT)', name_ar:'أوتراساوند الشريان السباتي', specimen:'procedure', container:'', prep_en:'No preparation needed.', prep_ar:'لا يحتاج تحضير.', hours:1 },
];

// Backward-compatible: keep LAB_TESTS as flat list derived from catalog
const LAB_TESTS = LAB_TEST_CATALOG.filter(t => t.cat !== 'radiology').map(t => ({code: t.code, name_ar: t.name_ar, name_en: t.name_en}));

// Nursing Procedures Guide
const NURSING_PROCEDURES = [
  { code:'IV_CANNULATION', cat:'iv', name_en:'IV Cannulation', name_ar:'تركيب كانيولا وريدية',
    steps_en:['Verify doctor order','Gather supplies: cannula (appropriate gauge), tourniquet, alcohol swab, tape/Tegaderm, saline flush, gloves','Explain procedure to patient and obtain verbal consent','Perform hand hygiene and put on gloves','Apply tourniquet 4-6 inches above intended site','Select vein — look for straight, bouncy vein','Clean site with alcohol swab in circular motion (30 seconds). Let dry completely','Insert cannula bevel-up at 10-30 degree angle','Watch for blood flashback in chamber','Advance catheter over needle, then withdraw needle','Release tourniquet','Connect saline flush — check for swelling or pain','Secure with transparent dressing (Tegaderm)','Label with date, time, gauge, and your initials','Dispose of needle in sharps container','Document in patient chart: site, gauge, number of attempts'],
    steps_ar:['تحقق من أمر الطبيب','جهز المستلزمات: كانيولا (مقاس مناسب)، رباط، مسحة كحول، لاصق/تيجاديرم، محلول ملحي للشطف، قفازات','اشرح الإجراء للمريض واحصل على موافقة شفهية','اغسل يديك والبس القفازات','ضع الرباط 10-15 سم فوق الموقع المقصود','اختر الوريد — ابحث عن وريد مستقيم ومرن','نظف الموقع بمسحة كحول بحركة دائرية (30 ثانية). اتركه يجف تماماً','أدخل الكانيولا بزاوية 10-30 درجة مع فتحة الإبرة للأعلى','راقب ظهور الدم في الغرفة','قدم القسطرة فوق الإبرة ثم اسحب الإبرة','حرر الرباط','وصل محلول الشطف — تحقق من عدم وجود تورم أو ألم','ثبت بضمادة شفافة','سجل التاريخ والوقت والمقاس وأحرفك الأولى','تخلص من الإبرة في حاوية الأدوات الحادة','وثق في ملف المريض: الموقع، المقاس، عدد المحاولات'],
    warnings_en:['Check for allergy to tape/adhesive','Avoid arm with AV fistula or on side of mastectomy','Avoid affected limb in stroke patients','Maximum 2 attempts — call senior if unsuccessful'],
    warnings_ar:['تحقق من حساسية اللاصق','تجنب الذراع التي بها ناسور شرياني وريدي أو جانب استئصال الثدي','تجنب الطرف المصاب في مرضى السكتة','حد أقصى محاولتين — اتصل بالمسؤول إذا لم تنجح'] },

  { code:'VENIPUNCTURE', cat:'specimen', name_en:'Blood Draw (Venipuncture)', name_ar:'سحب دم (بزل وريدي)',
    steps_en:['Verify order and patient identity (two identifiers: name + MRN)','Check required tubes and order of draw','Perform hand hygiene and put on gloves','Apply tourniquet','Select vein and clean with alcohol (let dry)','Insert needle into vein','Fill tubes in correct ORDER: Blood culture (yellow) → Citrate (blue) → SST (gold) → EDTA (purple) → Fluoride (gray)','Release tourniquet before removing needle','Remove needle and apply firm pressure with gauze for 2-3 minutes','Label ALL tubes at bedside with patient name, MRN, date, time','Dispose needle in sharps container immediately — NEVER recap','Transport tubes to lab within 1 hour'],
    steps_ar:['تحقق من الطلب وهوية المريض (معرفين: الاسم + رقم الملف)','تحقق من الأنابيب المطلوبة وترتيب السحب','اغسل يديك والبس القفازات','ضع الرباط','اختر الوريد ونظف بالكحول (اتركه يجف)','أدخل الإبرة في الوريد','املأ الأنابيب بالترتيب الصحيح: مزرعة دم (أصفر) ← سيترات (أزرق) ← SST (ذهبي) ← EDTA (بنفسجي) ← فلوريد (رمادي)','حرر الرباط قبل إزالة الإبرة','أزل الإبرة واضغط بقوة بالشاش لمدة 2-3 دقائق','سمِّ كل الأنابيب عند سرير المريض بالاسم ورقم الملف والتاريخ والوقت','تخلص من الإبرة في حاوية الأدوات الحادة فوراً — لا تعيد الغطاء أبداً','انقل الأنابيب للمختبر خلال ساعة واحدة'],
    warnings_en:['Order of draw matters — wrong order can contaminate samples','NEVER recap needles','If patient is on anticoagulants, apply pressure for 5+ minutes'],
    warnings_ar:['ترتيب السحب مهم — الترتيب الخاطئ قد يلوث العينات','لا تعيد غطاء الإبرة أبداً','إذا كان المريض على مضادات تخثر، اضغط 5 دقائق أو أكثر'] },

  { code:'FOLEY_INSERT', cat:'catheter', name_en:'Urinary Catheter (Foley) Insertion', name_ar:'تركيب قسطرة بولية (فولي)',
    steps_en:['Verify doctor order and check for contraindications','Gather catheter kit (correct French size), sterile gloves, drape, lubricant, 10mL syringe with sterile water, urine drainage bag','Explain procedure to patient — ensure privacy','Position patient (supine, knees bent for female; supine for male)','Perform hand hygiene, open kit using sterile technique','Drape patient with sterile drape','Clean urethral meatus: Female: front-to-back, each swab once. Male: circular from meatus outward','Lubricate catheter tip generously','Insert catheter gently — advance until urine flows, then advance 2-3 cm more','Inflate balloon with sterile water per package instructions (usually 10 mL)','Gently pull catheter back until resistance (balloon seated at bladder neck)','Connect to closed drainage bag','Secure catheter to inner thigh with tape/strap','Hang drainage bag below bladder level — never on floor','Document: catheter size, balloon volume, time inserted, initial urine output, tolerance'],
    steps_ar:['تحقق من أمر الطبيب وتحقق من عدم وجود موانع','جهز طقم القسطرة (مقاس فرنسي صحيح)، قفازات معقمة، شرشف، مزلق، سرنجة 10 مل بماء معقم، كيس تصريف بول','اشرح الإجراء للمريض — تأكد من الخصوصية','ضع المريض في الوضعية المناسبة','اغسل يديك، افتح الطقم بتقنية معقمة','غطِّ المريض بشرشف معقم','نظف فتحة الإحليل','ضع المزلق على طرف القسطرة بكمية كافية','أدخل القسطرة برفق حتى يتدفق البول ثم قدم 2-3 سم إضافية','انفخ البالون بالماء المعقم حسب تعليمات العبوة','اسحب القسطرة برفق حتى تشعر بمقاومة','وصل بكيس تصريف مغلق','ثبت القسطرة على الفخذ الداخلي','علق كيس التصريف تحت مستوى المثانة','وثق: مقاس القسطرة، حجم البالون، وقت التركيب، كمية البول الأولية'],
    warnings_en:['NEVER force the catheter — if resistance, stop and call senior','Use smallest catheter size appropriate','Check for latex allergy before starting','Male patients: hold penis at 90° angle during insertion'],
    warnings_ar:['لا تدفع القسطرة بالقوة أبداً — إذا كانت هناك مقاومة، توقف واتصل بالمسؤول','استخدم أصغر مقاس مناسب','تحقق من حساسية اللاتكس قبل البدء','المرضى الذكور: أمسك العضو بزاوية 90 درجة أثناء الإدخال'] },

  { code:'WOUND_CARE', cat:'wound', name_en:'Wound Care / Dressing Change', name_ar:'عناية بالجرح / تغيير ضمادة',
    steps_en:['Review wound care orders','Gather supplies: sterile gloves, gauze, saline, ordered treatment/ointment, dressing, tape','Explain to patient — administer pain medication 30 min before if needed','Position patient for access to wound','Perform hand hygiene, put on clean gloves','Remove old dressing carefully — note drainage (amount, color, odor)','Remove gloves, hand hygiene, put on STERILE gloves','Assess wound: measure size (L×W×D), color, edges, tunneling, signs of infection','Clean wound with saline — from center outward, never back to wound','Apply ordered treatment/medication','Apply new dressing and secure with tape','Remove gloves, hand hygiene','Document: wound size, appearance, drainage, treatment applied, patient tolerance'],
    steps_ar:['راجع أوامر العناية بالجرح','جهز المستلزمات: قفازات معقمة، شاش، محلول ملحي، العلاج المطلوب، ضمادة، لاصق','اشرح للمريض — أعطِ مسكن ألم قبل 30 دقيقة إذا لزم','ضع المريض في وضعية تسمح بالوصول للجرح','اغسل يديك، البس قفازات نظيفة','أزل الضمادة القديمة بحذر — لاحظ الإفرازات (الكمية، اللون، الرائحة)','أزل القفازات، اغسل يديك، البس قفازات معقمة','قيّم الجرح: قس الحجم، اللون، الحواف، علامات العدوى','نظف الجرح بالمحلول الملحي — من المركز للخارج','ضع العلاج المطلوب','ضع ضمادة جديدة وثبتها','أزل القفازات واغسل يديك','وثق: حجم الجرح، المظهر، الإفرازات، العلاج المطبق'],
    warnings_en:['Always clean from CLEAN area to DIRTY area','Watch for signs of infection: increased redness, warmth, swelling, purulent drainage, fever','If wound has exposed bone or tendon — notify surgeon immediately'],
    warnings_ar:['نظف دائماً من المنطقة النظيفة للمنطقة المتسخة','راقب علامات العدوى: احمرار متزايد، حرارة، تورم، إفرازات صديدية، حمى','إذا كان العظم أو الوتر مكشوفاً — أبلغ الجراح فوراً'] },

  { code:'MED_ORAL', cat:'medication', name_en:'Medication Administration (Oral)', name_ar:'إعطاء الدواء (فموي)',
    steps_en:['Check prescription: 5 Rights — Right Patient, Right Drug, Right Dose, Right Route, Right Time','Check patient allergies in chart AND ask patient','Check for drug interactions with current medications','Prepare medication — do NOT crush enteric-coated or extended-release tablets','Verify patient identity (ask name + check wristband/MRN)','Explain medication to patient: what it is, what it does, expected side effects','Offer water, assist patient to sitting position if needed','Observe patient swallowing the medication','Document: medication name, dose, time given, route, your signature','Monitor for adverse reactions for 30 minutes'],
    steps_ar:['تحقق من الوصفة: 5 صحيحات — المريض الصحيح، الدواء الصحيح، الجرعة الصحيحة، الطريقة الصحيحة، الوقت الصحيح','تحقق من حساسية المريض في الملف واسأل المريض','تحقق من التفاعلات الدوائية مع الأدوية الحالية','حضر الدواء — لا تطحن الأقراص المغلفة معوياً أو ممتدة المفعول','تحقق من هوية المريض (اسأل الاسم + تحقق من السوار/رقم الملف)','اشرح الدواء للمريض: ما هو، ماذا يفعل، الآثار الجانبية المتوقعة','قدم ماء، ساعد المريض على الجلوس إذا لزم','راقب المريض وهو يبتلع الدواء','وثق: اسم الدواء، الجرعة، الوقت، الطريقة، توقيعك','راقب ردود الفعل السلبية لمدة 30 دقيقة'],
    warnings_en:['NEVER give medication without checking allergies','If patient vomits within 30 minutes, notify doctor before re-dosing','NPO patients cannot receive oral medications — check with doctor for alternative route'],
    warnings_ar:['لا تعطِ دواء بدون التحقق من الحساسية','إذا تقيأ المريض خلال 30 دقيقة، أبلغ الطبيب قبل إعادة الجرعة','مرضى NPO لا يمكنهم تناول أدوية فموية — استشر الطبيب لطريقة بديلة'] },

  { code:'BLOOD_TRANSFUSION', cat:'medication', name_en:'Blood Transfusion', name_ar:'نقل الدم',
    steps_en:['Verify doctor order for blood product type and units','Verify blood product at bedside with SECOND NURSE: check patient ID band, blood type, unit number, expiry date, crossmatch compatibility','Take baseline vital signs BEFORE starting','Start infusion slowly: first 15 min at 2 mL/min (or per protocol)','STAY with patient for the first 15 minutes','Check vital signs at: 15 min, 30 min, 1 hour, and at completion','Complete transfusion within 4 hours of leaving blood bank','Document: product type, unit number, start/end time, total volume, vital signs, any reactions'],
    steps_ar:['تحقق من أمر الطبيب لنوع منتج الدم والوحدات','تحقق من منتج الدم عند السرير مع ممرض/ة ثاني/ة: تحقق من سوار هوية المريض، فصيلة الدم، رقم الوحدة، تاريخ الانتهاء، توافق التطابق','قس العلامات الحيوية الأساسية قبل البدء','ابدأ بالتسريب ببطء: أول 15 دقيقة بمعدل 2 مل/دقيقة','ابقَ مع المريض أول 15 دقيقة','قس العلامات الحيوية عند: 15 دقيقة، 30 دقيقة، ساعة، وعند الانتهاء','أكمل النقل خلال 4 ساعات من مغادرة بنك الدم','وثق: نوع المنتج، رقم الوحدة، وقت البدء/الانتهاء، الحجم الكلي، العلامات الحيوية، أي ردود فعل'],
    warnings_en:['STOP transfusion immediately if: fever, chills, rash, SOB, back pain, dark urine','Two-nurse verification is MANDATORY — never skip','Keep emergency medications nearby: Epinephrine, Hydrocortisone, Diphenhydramine','Never add medications to blood products'],
    warnings_ar:['أوقف النقل فوراً إذا: حمى، رعشة، طفح، ضيق تنفس، ألم ظهر، بول داكن','التحقق بممرضين إلزامي — لا تتخطاه أبداً','احتفظ بأدوية الطوارئ قريبة: إبينفرين، هيدروكورتيزون، ديفينهيدرامين','لا تضف أدوية لمنتجات الدم'] },

  { code:'VITALS_CHECK', cat:'assessment', name_en:'Vital Signs Assessment', name_ar:'قياس العلامات الحيوية',
    steps_en:['Perform hand hygiene','Verify patient identity','Measure Blood Pressure: correct cuff size, arm at heart level, patient rested 5 min','Measure Heart Rate: count for 30 seconds × 2, or use pulse oximeter','Measure Temperature: oral, axillary, or tympanic as appropriate','Measure Respiratory Rate: count for 30 seconds × 2 while patient is unaware','Measure Oxygen Saturation (SpO2) with pulse oximeter','Ask Pain Score (0-10 scale)','If diabetic patient: check blood glucose','Document all values immediately','Report abnormal values to physician immediately: SBP >180 or <90, HR >120 or <50, Temp >38.5, SpO2 <92, RR >24'],
    steps_ar:['اغسل يديك','تحقق من هوية المريض','قس ضغط الدم: مقاس كف صحيح، الذراع على مستوى القلب، المريض مرتاح 5 دقائق','قس معدل النبض: عد 30 ثانية × 2','قس درجة الحرارة: فموي، إبطي، أو طبلي حسب المناسب','قس معدل التنفس: عد 30 ثانية × 2 بدون علم المريض','قس تشبع الأكسجين بمقياس النبض','اسأل عن درجة الألم (مقياس 0-10)','إذا كان المريض مصاباً بالسكر: افحص سكر الدم','وثق كل القيم فوراً','أبلغ الطبيب فوراً عن القيم غير الطبيعية'],
    warnings_en:['Do NOT measure BP on arm with IV line, AV fistula, or on affected side after mastectomy/stroke','Report critical values IMMEDIATELY — do not wait for rounds'],
    warnings_ar:['لا تقس الضغط على الذراع التي بها خط وريدي أو ناسور أو الجانب المصاب بعد استئصال الثدي/السكتة','أبلغ عن القيم الحرجة فوراً — لا تنتظر الجولة'] },

  { code:'GLUCOSE_CHECK', cat:'assessment', name_en:'Blood Glucose Monitoring', name_ar:'فحص سكر الدم',
    steps_en:['Verify order and timing: AC (before meals), PC (after meals), HS (bedtime), or as ordered','Perform hand hygiene, put on gloves','Prepare glucometer — check calibration and expiry of test strips','Clean finger site with alcohol swab — let dry COMPLETELY (wet alcohol = false reading)','Use lancet on SIDE of fingertip (less painful, better blood flow)','Apply blood drop to test strip — do not squeeze finger excessively','Read and record result','Apply pressure to puncture site with cotton ball','Compare result with insulin sliding scale if applicable','If glucose <70 mg/dL: give 15g fast-acting carbs, recheck in 15 min, notify doctor','If glucose >300 mg/dL: notify doctor immediately, check for ketones if Type 1','Document reading, time, and any insulin given'],
    steps_ar:['تحقق من الطلب والتوقيت: AC (قبل الوجبات)، PC (بعد الوجبات)، HS (وقت النوم)','اغسل يديك والبس القفازات','حضر جهاز السكر — تحقق من المعايرة وصلاحية الشرائح','نظف موقع الإصبع بمسحة كحول — اتركه يجف تماماً','استخدم الوخز على جانب طرف الإصبع (أقل ألماً)','ضع قطرة دم على شريط الاختبار — لا تضغط الإصبع بشكل مفرط','اقرأ وسجل النتيجة','اضغط على موقع الوخز بقطنة','قارن النتيجة مع جدول الإنسولين المتدرج إذا كان موجوداً','إذا كان السكر أقل من 70: أعطِ 15 غم كربوهيدرات سريعة المفعول، أعد الفحص بعد 15 دقيقة، أبلغ الطبيب','إذا كان السكر أعلى من 300: أبلغ الطبيب فوراً','وثق القراءة والوقت وأي إنسولين أُعطي'],
    warnings_en:['Wet alcohol on skin causes FALSE LOW readings','Critical low (<40): EMERGENCY — notify doctor immediately, start D50W if ordered','Do not use same lancet on multiple patients'],
    warnings_ar:['الكحول الرطب على الجلد يسبب قراءات منخفضة خاطئة','انخفاض حرج (<40): طوارئ — أبلغ الطبيب فوراً','لا تستخدم نفس الوخز على أكثر من مريض'] },

  { code:'O2_ADMIN', cat:'respiratory', name_en:'Oxygen Administration', name_ar:'إعطاء الأكسجين',
    steps_en:['Verify doctor order: flow rate (L/min) and delivery device','Select correct device: Nasal cannula (1-6 L/min), Simple mask (6-10), Non-rebreather (10-15), Venturi mask (precise FiO2)','Connect tubing to oxygen source (wall outlet or portable tank)','Adjust flow rate to ordered setting','Apply device to patient — ensure proper fit','Check SpO2 with pulse oximeter after 5 minutes','Assess patient comfort — check for skin irritation behind ears/nose','For nasal cannula: apply water-based lubricant to nares if dry','Document: device, flow rate, SpO2 before and after, patient response'],
    steps_ar:['تحقق من أمر الطبيب: معدل التدفق وجهاز التوصيل','اختر الجهاز المناسب: قنية أنفية (1-6 ل/د)، قناع بسيط (6-10)، قناع بدون إعادة تنفس (10-15)','وصل الأنبوب بمصدر الأكسجين','اضبط معدل التدفق حسب الطلب','ضع الجهاز على المريض — تأكد من الملاءمة','تحقق من تشبع الأكسجين بعد 5 دقائق','قيّم راحة المريض','وثق: الجهاز، معدل التدفق، تشبع الأكسجين قبل وبعد'],
    warnings_en:['COPD patients: target SpO2 88-92% — high O2 can suppress respiratory drive','Never use oil-based products near oxygen (fire hazard)','Check oxygen tank levels regularly — ensure backup available'],
    warnings_ar:['مرضى COPD: هدف تشبع الأكسجين 88-92% — الأكسجين العالي قد يثبط الدافع التنفسي','لا تستخدم منتجات زيتية بالقرب من الأكسجين (خطر حريق)','تحقق من مستويات خزان الأكسجين بانتظام'] },

  { code:'FALL_RISK', cat:'assessment', name_en:'Fall Risk Assessment & Prevention', name_ar:'تقييم ومنع خطر السقوط',
    steps_en:['Assess using Morse Fall Scale: History of falling (25pts), Secondary diagnosis (15pts), Ambulatory aid (15pts), IV/heparin lock (20pts), Gait (10-20pts), Mental status (15pts)','Calculate total score: Low risk (0-24), Moderate (25-50), High risk (>50)','For HIGH RISK: Apply yellow fall risk wristband','Ensure bed in LOWEST position with wheels locked','Keep side rails up (2 or 4 as per policy)','Place call bell within patient reach','Ensure non-slip footwear available','Clear path from bed to bathroom — remove obstacles','Ensure adequate room lighting, especially at night','Educate patient and family about fall prevention','Document assessment score, risk level, and interventions implemented','Reassess every shift and after any change in condition'],
    steps_ar:['قيّم باستخدام مقياس مورس للسقوط','احسب الدرجة الإجمالية: خطر منخفض (0-24)، متوسط (25-50)، عالي (>50)','للخطر العالي: ضع سوار أصفر لخطر السقوط','تأكد أن السرير في أدنى وضع مع قفل العجلات','ارفع حواجز السرير','ضع جرس الاستدعاء في متناول المريض','تأكد من توفر حذاء مانع للانزلاق','أزل العوائق من المسار بين السرير والحمام','تأكد من إضاءة كافية خاصة ليلاً','ثقف المريض والعائلة عن منع السقوط','وثق درجة التقييم ومستوى الخطر والتدخلات','أعد التقييم كل مناوبة وبعد أي تغيير في الحالة'],
    warnings_en:['Patients >65 years old are automatically HIGH fall risk','Post-anesthesia patients: monitor closely for 24 hours','Patients on sedatives, opioids, or antihypertensives: increased fall risk'],
    warnings_ar:['المرضى فوق 65 سنة يعتبرون تلقائياً خطر سقوط عالي','مرضى ما بعد التخدير: راقب عن كثب لمدة 24 ساعة','المرضى على مهدئات أو أفيونات أو خافضات ضغط: خطر سقوط متزايد'] },

  { code:'SUCTION', cat:'respiratory', name_en:'Suctioning (Oral/Tracheal)', name_ar:'شفط (فموي/رغامي)',
    steps_en:['Assess need: audible secretions, decreased SpO2, visible secretions, increased work of breathing','Gather equipment: suction catheter, sterile gloves, sterile saline, suction unit, face shield','Pre-oxygenate patient with 100% O2 for 30 seconds','Perform hand hygiene, put on sterile gloves','For tracheal: use sterile technique throughout','Insert catheter WITHOUT suction — advance gently','Apply suction while withdrawing catheter with rotating motion (max 10-15 seconds)','Allow patient to recover between passes (re-oxygenate)','Repeat if needed — maximum 3 passes','Re-establish oxygen at ordered settings','Document: amount, color, consistency of secretions, patient tolerance, SpO2 before and after'],
    steps_ar:['قيّم الحاجة: إفرازات مسموعة، انخفاض تشبع الأكسجين، إفرازات مرئية','جهز المعدات: قسطرة شفط، قفازات معقمة، محلول ملحي معقم، جهاز شفط','أعطِ المريض أكسجين 100% لمدة 30 ثانية','اغسل يديك والبس قفازات معقمة','للشفط الرغامي: استخدم تقنية معقمة طوال الإجراء','أدخل القسطرة بدون شفط — قدم برفق','طبق الشفط أثناء سحب القسطرة بحركة دورانية (أقصى 10-15 ثانية)','اترك المريض يستريح بين المرات','كرر إذا لزم — 3 مرات كحد أقصى','أعد الأكسجين للإعدادات المطلوبة','وثق: الكمية، اللون، القوام للإفرازات، تحمل المريض، تشبع الأكسجين قبل وبعد'],
    warnings_en:['Maximum suction time: 10-15 seconds per pass — prolonged suctioning causes hypoxia','Watch for cardiac arrhythmias during suctioning','Bloody secretions: stop and notify doctor'],
    warnings_ar:['أقصى وقت شفط: 10-15 ثانية لكل مرة — الشفط المطول يسبب نقص الأكسجين','راقب اضطرابات القلب أثناء الشفط','إفرازات دموية: توقف وأبلغ الطبيب'] },

  { code:'NG_INSERT', cat:'catheter', name_en:'Nasogastric (NG) Tube Insertion', name_ar:'تركيب أنبوب أنفي معدي',
    steps_en:['Verify doctor order','Measure NEX length: Nose → Ear → Xiphoid process — mark on tube','Gather supplies: NG tube (correct size), lubricant, syringe (60mL), pH strips, tape, stethoscope, gloves','Position patient upright at 90 degrees','Explain procedure — give patient a cup of water with straw','Lubricate tube tip generously','Insert tube through nostril along floor of nasal passage','When tube reaches oropharynx: ask patient to swallow/sip water while you advance','Continue advancing to measured mark','Verify placement: Aspirate stomach contents and check pH (<5.5 confirms gastric placement)','If pH >5.5 or no aspirate: obtain X-ray confirmation before use','Secure tube with tape to nose — avoid pressure on nostril','Connect to drainage bag or feeding pump as ordered','Document: nostril used, tube size, insertion depth, verification method, patient tolerance'],
    steps_ar:['تحقق من أمر الطبيب','قس مسافة NEX: الأنف ← الأذن ← الناتئ الخنجري — علم على الأنبوب','جهز المستلزمات: أنبوب أنفي معدي (مقاس صحيح)، مزلق، سرنجة 60 مل، شرائح pH، لاصق، سماعة، قفازات','ضع المريض جالساً بزاوية 90 درجة','اشرح الإجراء — أعطِ المريض كوب ماء بشفاطة','ضع المزلق على طرف الأنبوب بكمية كافية','أدخل الأنبوب عبر فتحة الأنف على طول أرضية الممر الأنفي','عندما يصل الأنبوب للبلعوم: اطلب من المريض البلع/شرب الماء أثناء التقديم','استمر بالتقديم للعلامة المقاسة','تحقق من الوضع: اسحب محتويات المعدة وتحقق من pH (<5.5 يؤكد الوضع المعدي)','إذا كان pH >5.5: احصل على أشعة للتأكيد قبل الاستخدام','ثبت الأنبوب بلاصق على الأنف','وصل بكيس التصريف أو مضخة التغذية حسب الطلب','وثق: فتحة الأنف المستخدمة، مقاس الأنبوب، عمق الإدخال، طريقة التحقق'],
    warnings_en:['NEVER use NG tube until placement is confirmed','Contraindicated in: basal skull fracture, severe facial trauma','If patient coughs persistently or shows respiratory distress — tube may be in trachea, REMOVE immediately'],
    warnings_ar:['لا تستخدم الأنبوب أبداً حتى يتم التأكد من وضعه','موانع: كسر قاعدة الجمجمة، رضح وجهي شديد','إذا كان المريض يسعل بشكل مستمر أو يظهر ضيق تنفس — الأنبوب قد يكون في القصبة الهوائية، أزله فوراً'] },

  { code:'REPOSITION', cat:'assessment', name_en:'Patient Repositioning (Pressure Injury Prevention)', name_ar:'تغيير وضعية المريض (الوقاية من قرح الضغط)',
    steps_en:['Assess current position and time since last repositioning','Check all pressure points: sacrum, heels, elbows, shoulders, occiput, ears','Reposition patient (turn every 2 hours as per schedule)','Use pillows/wedges to offload pressure from bony prominences','Apply heel protectors/elevate heels off bed if at risk','Ensure no tubing, lines, or wrinkles in sheets under patient','Moisturize dry skin — do NOT massage reddened areas','Assess skin condition at each repositioning','Document: position, time, skin assessment, any areas of concern','Update turning schedule on whiteboard/chart'],
    steps_ar:['قيّم الوضعية الحالية والوقت منذ آخر تغيير وضعية','تحقق من كل نقاط الضغط: العجز، الكعبين، المرفقين، الكتفين','غير وضعية المريض (كل ساعتين حسب الجدول)','استخدم وسائد لتخفيف الضغط عن البروزات العظمية','ضع واقيات كعب أو ارفع الكعبين عن السرير','تأكد من عدم وجود أنابيب أو خطوط أو تجاعيد في الملاءة تحت المريض','رطب الجلد الجاف — لا تدلك المناطق المحمرة','قيّم حالة الجلد عند كل تغيير وضعية','وثق: الوضعية، الوقت، تقييم الجلد','حدث جدول التقليب'],
    warnings_en:['NEVER drag patient — use draw sheet and proper body mechanics','Reddened areas that do not blanch = Stage 1 pressure injury — report immediately','Patients on ventilator: maintain head of bed 30-45 degrees'],
    warnings_ar:['لا تسحب المريض أبداً — استخدم ملاءة السحب وميكانيكا الجسم الصحيحة','المناطق المحمرة التي لا تبيض عند الضغط = إصابة ضغط مرحلة 1 — أبلغ فوراً','مرضى جهاز التنفس: حافظ على رأس السرير بزاوية 30-45 درجة'] },
];

/**
 * Get translated string. Falls back to English if key not found.
 * @param {string} key - the LANG key
 * @param {object} [params] - replacement params, e.g. {role: 'Doctor'}
 * @returns {string}
 */
function t(key, params) {
  const lang = currentLanguage();
  const entry = LANG[key];
  if (!entry) return key;
  let str = entry[lang] || entry.en || key;
  if (params) {
    Object.keys(params).forEach(k => {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
    });
  }
  return str;
}

/**
 * Get current language from localStorage
 * @returns {'ar'|'en'}
 */
function currentLanguage() {
  return localStorage.getItem('his_language') || 'en';
}

/**
 * Set language and apply direction
 * @param {'ar'|'en'} lang
 */
function setLanguage(lang) {
  localStorage.setItem('his_language', lang);
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
  if (lang === 'ar') {
    document.body.classList.add('rtl');
  } else {
    document.body.classList.remove('rtl');
  }
}

/**
 * Apply saved language on page load
 */
function applyLanguage() {
  const lang = currentLanguage();
  setLanguage(lang);
}
