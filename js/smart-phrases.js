// ============================================================
// HIS — Smart Phrases (Text Expansion)
// ============================================================
// Usage: In any <textarea>, type "/" then a shortcut name (e.g. /htn)
// and press Tab/Enter to expand into a full clinical template.
// ============================================================

const SMART_PHRASES = {
  // ---- Common Chief Complaints / SOAP ----
  'chest_pain': {
    label: 'Chest Pain Assessment',
    ar: 'تقييم ألم الصدر',
    text_en: 'Patient reports chest pain. Onset: [time]. Quality: [sharp/dull/pressure]. Radiation: [yes/no, location]. Severity: [/10]. Associated symptoms: [SOB/diaphoresis/nausea/dizziness]. Aggravating factors: [exertion/rest]. Relieving factors: [rest/nitro].',
    text_ar: 'يشكو المريض من ألم في الصدر. البداية: [الوقت]. النوع: [حاد/خفيف/ضاغط]. الانتشار: [نعم/لا، الموقع]. الشدة: [/10]. الأعراض المصاحبة: [ضيق نفس/تعرق/غثيان/دوخة]. عوامل التفاقم: [مجهود/راحة]. عوامل التحسن: [راحة/نتروجلسرين].'
  },
  'sob': {
    label: 'Shortness of Breath',
    ar: 'ضيق التنفس',
    text_en: 'Patient reports shortness of breath. Onset: [acute/gradual]. Triggers: [exertion/rest/lying flat]. Associated cough: [yes/no, productive/dry]. Wheezing: [yes/no]. Orthopnea: [yes/no, # pillows]. PND: [yes/no].',
    text_ar: 'يشكو المريض من ضيق في التنفس. البداية: [حاد/تدريجي]. المحفزات: [مجهود/راحة/الاستلقاء]. سعال مصاحب: [نعم/لا، منتج/جاف]. صفير: [نعم/لا]. ضيق التنفس عند الاستلقاء: [نعم/لا، عدد الوسائد]. ضيق التنفس الليلي الانتيابي: [نعم/لا].'
  },
  'abd_pain': {
    label: 'Abdominal Pain',
    ar: 'ألم البطن',
    text_en: 'Abdominal pain. Location: [RUQ/LUQ/RLQ/LLQ/diffuse/epigastric]. Onset: [acute/chronic]. Character: [colicky/sharp/dull]. Severity: [/10]. Radiation: [yes/no]. Aggravated by: [food/movement]. Associated: [N/V/diarrhea/constipation/fever].',
    text_ar: 'ألم في البطن. الموقع: [أعلى يمين/أعلى يسار/أسفل يمين/أسفل يسار/منتشر/فوق المعدة]. البداية: [حاد/مزمن]. الطبيعة: [مغصي/حاد/خفيف]. الشدة: [/10]. الانتشار: [نعم/لا]. يزداد بـ: [طعام/حركة]. مصاحب: [غثيان/إسهال/إمساك/حمى].'
  },
  // ---- Chronic Conditions ----
  'htn': {
    label: 'Hypertension Note',
    ar: 'ملاحظة ارتفاع ضغط الدم',
    text_en: 'HTN, currently managed on [medications]. Last BP reading: [value]. Compliance: [good/poor]. End-organ damage: [denies/has retinopathy/nephropathy/LVH].',
    text_ar: 'ارتفاع ضغط الدم، يُعالج حالياً بـ [الأدوية]. آخر قراءة: [القيمة]. الالتزام: [جيد/ضعيف]. تأثيرات على الأعضاء: [لا يوجد/اعتلال الشبكية/اعتلال الكلى/تضخم البطين الأيسر].'
  },
  'dm': {
    label: 'Diabetes Note',
    ar: 'ملاحظة مرض السكري',
    text_en: 'DM type [1/2], duration: [years]. HbA1c: [value]. Compliance with [insulin/oral hypoglycemics/diet]. Complications: [denies/retinopathy/nephropathy/neuropathy]. Last fundus exam: [date].',
    text_ar: 'مرض السكري النوع [1/2]، المدة: [سنوات]. السكر التراكمي: [القيمة]. الالتزام بـ [الأنسولين/أدوية فموية/الحمية]. المضاعفات: [لا يوجد/اعتلال الشبكية/الكلى/الأعصاب]. آخر فحص لقاع العين: [التاريخ].'
  },
  'ckd': {
    label: 'CKD Note',
    ar: 'ملاحظة مرض الكلى المزمن',
    text_en: 'CKD stage [3a/3b/4/5], baseline creatinine: [value], eGFR: [value]. On [dialysis: HD/PD, M/W/F]. Etiology: [DM/HTN/GN]. Vascular access: [AV fistula/graft/catheter].',
    text_ar: 'مرض الكلى المزمن المرحلة [3أ/3ب/4/5]، الكرياتينين الأساسي: [القيمة]، معدل الترشيح: [القيمة]. على [غسيل: دموي/بريتوني، الأيام]. السبب: [السكري/ارتفاع الضغط/التهاب الكلى]. الوصول الوعائي: [ناسور/طعم/قسطرة].'
  },
  // ---- Nursing ----
  'shift': {
    label: 'Shift Handoff',
    ar: 'تسليم مناوبة',
    text_en: 'Shift handoff:\n• Patient stable, vitals within normal limits.\n• All scheduled medications administered.\n• I/O recorded. Last BM: [date/time].\n• Tasks pending for next shift: [list].\n• Family notified of [event/status].\n• Concerns to watch: [details].',
    text_ar: 'تسليم المناوبة:\n• المريض مستقر، العلامات الحيوية ضمن الحدود الطبيعية.\n• تم إعطاء جميع الأدوية المجدولة.\n• تم تسجيل المدخلات/المخرجات. آخر تبرز: [التاريخ/الوقت].\n• المهام المعلقة للمناوبة القادمة: [قائمة].\n• تم إخطار الأسرة بـ [الحدث/الحالة].\n• مخاوف يجب مراقبتها: [التفاصيل].'
  },
  'pain_assess': {
    label: 'Pain Assessment',
    ar: 'تقييم الألم',
    text_en: 'Pain assessment: location [site], intensity [/10], character [aching/burning/sharp/throbbing], radiation [yes/no], aggravating factors [movement/touch], relieving factors [rest/medication], current treatment [drug/dose] effective: [yes/no].',
    text_ar: 'تقييم الألم: الموقع [الموضع]، الشدة [/10]، الطبيعة [وجع/حرقة/حاد/نابض]، الانتشار [نعم/لا]، عوامل التفاقم [حركة/لمس]، عوامل التحسن [راحة/دواء]، العلاج الحالي [الدواء/الجرعة] فعّال: [نعم/لا].'
  },
  // ---- Plan / Disposition ----
  'admit': {
    label: 'Admission Plan',
    ar: 'خطة الإدخال',
    text_en: 'Admit to [department]. Diet: [NPO/regular/diabetic/cardiac]. Activity: [bed rest/up ad lib/PT]. Vitals: [q4h/q8h]. IV: [type/rate]. Telemetry: [yes/no]. Labs: [CBC/CMP/troponin]. Imaging: [CXR/CT/MRI]. Consults: [cardio/nephro].',
    text_ar: 'إدخال إلى [القسم]. الحمية: [صائم/عادي/سكري/قلبي]. النشاط: [راحة بالسرير/متحرر/علاج طبيعي]. العلامات الحيوية: [كل 4 ساعات/كل 8 ساعات]. وريدي: [النوع/المعدل]. مراقبة قلبية: [نعم/لا]. التحاليل: [CBC/CMP/تروبونين]. الأشعة: [صدر/مقطعية/رنين]. استشارات: [قلب/كلى].'
  },
  'dc': {
    label: 'Discharge Plan',
    ar: 'خطة الخروج',
    text_en: 'Patient stable for discharge. Diagnosis: [primary], [secondary]. Discharge medications: [list]. Follow-up: [clinic/date/time]. Diet: [type]. Activity: [restrictions]. Return precautions: chest pain, SOB, fever, [other]. Patient/family verbalized understanding.',
    text_ar: 'المريض مستقر للخروج. التشخيص: [الرئيسي]، [الثانوي]. أدوية الخروج: [القائمة]. المتابعة: [العيادة/التاريخ/الوقت]. الحمية: [النوع]. النشاط: [القيود]. تنبيهات العودة: ألم صدر، ضيق نفس، حمى، [أخرى]. المريض/العائلة أبدوا الفهم.'
  },
  'normal': {
    label: 'Normal Exam',
    ar: 'فحص طبيعي',
    text_en: 'General: alert, oriented x3, NAD. HEENT: PERRL, EOMI, MMM. Neck: supple, no JVD. CV: RRR, no m/r/g. Lungs: CTA bilaterally. Abd: soft, NT, ND, +BS. Ext: no edema, pulses 2+. Neuro: CN II-XII intact, strength 5/5, sensation intact.',
    text_ar: 'عام: يقظ، موجه x3، لا توجد ضائقة حادة. الرأس والرقبة: حدقتان متفاعلتان، حركة عينين سليمة، أغشية مخاطية رطبة. الرقبة: مرنة، لا انتفاخ بالأوردة الوداجية. القلب: إيقاع منتظم، لا نفخات/احتكاكات. الرئتان: واضحتان للسماع ثنائياً. البطن: لين، غير مؤلم، غير منتفخ، أصوات أمعاء موجودة. الأطراف: لا وذمة، النبض 2+. الأعصاب: الأعصاب القحفية 2-12 سليمة، القوة 5/5، الحس سليم.'
  },
  // ---- Code blue / sepsis ----
  'sepsis': {
    label: 'Sepsis Workup',
    ar: 'تقييم الإنتان',
    text_en: 'Sepsis workup initiated. SIRS criteria: [temp/HR/RR/WBC]. qSOFA: [score]. Source suspected: [pneumonia/UTI/abdominal/skin]. Cultures sent: [blood x2/urine/sputum]. Lactate: [value]. Broad-spectrum antibiotics started: [drug/dose]. Fluid resuscitation: [amount NS].',
    text_ar: 'بدء تقييم الإنتان. معايير SIRS: [حرارة/نبض/تنفس/كريات بيضاء]. qSOFA: [الدرجة]. مصدر مشتبه: [التهاب رئوي/مسالك بولية/بطن/جلد]. مزارع مرسلة: [دم x2/بول/قشع]. اللاكتات: [القيمة]. بدء مضادات حيوية واسعة الطيف: [الدواء/الجرعة]. تعويض السوائل: [الكمية محلول ملحي].'
  },
  // ---- Quick generic ones ----
  'family': {
    label: 'Family Communication',
    ar: 'تواصل مع الأسرة',
    text_en: 'Family meeting held with [relation]. Discussed: [diagnosis/prognosis/plan]. Questions answered. Family in agreement with plan: [yes/no].',
    text_ar: 'اجتماع عائلي مع [القرابة]. تمت مناقشة: [التشخيص/المآل/الخطة]. تمت الإجابة على الأسئلة. الأسرة موافقة على الخطة: [نعم/لا].'
  },
  'consent': {
    label: 'Informed Consent',
    ar: 'موافقة مستنيرة',
    text_en: 'Informed consent obtained for [procedure]. Risks, benefits, alternatives discussed. Questions answered. Patient/legal guardian verbalized understanding and signed consent.',
    text_ar: 'تم الحصول على الموافقة المستنيرة لـ [الإجراء]. تمت مناقشة المخاطر والفوائد والبدائل. تمت الإجابة على الأسئلة. المريض/الوصي القانوني أبدى الفهم ووقّع الموافقة.'
  },
  // ---- More Chief Complaints ----
  'fever': {
    label: 'Fever', ar: 'الحمى',
    text_en: 'Fever onset [time]. Tmax [°C]. Associated: [chills/rigors/sweats/myalgia/headache]. Sources of infection screened: [URTI/UTI/skin/GI/CNS]. Recent travel: [yes/no, location]. Sick contacts: [yes/no].',
    text_ar: 'بداية الحمى [الوقت]. الحرارة العظمى [°م]. مصاحبة: [قشعريرة/تعرق/ألم عضلي/صداع]. تم البحث عن مصادر العدوى: [رئوي/مسالك/جلد/معدي/عصبي]. سفر حديث: [نعم/لا، الموقع]. مخالطين مرضى: [نعم/لا].'
  },
  'cough': {
    label: 'Cough Assessment', ar: 'تقييم السعال',
    text_en: 'Cough duration [days/weeks]. Quality: [dry/productive]. Sputum: [color/amount]. Associated: [SOB/fever/wheezing/chest pain/hemoptysis]. Smoking history: [pack-years].',
    text_ar: 'مدة السعال [أيام/أسابيع]. الطبيعة: [جاف/منتج]. القشع: [اللون/الكمية]. مصاحب: [ضيق نفس/حمى/صفير/ألم صدر/نفث دم]. التدخين: [عبوة-سنة].'
  },
  'headache': {
    label: 'Headache', ar: 'الصداع',
    text_en: 'Headache. Onset: [acute/gradual]. Location: [frontal/temporal/occipital/global]. Quality: [throbbing/pressing/sharp]. Severity: [/10]. Associated: [N/V/photophobia/phonophobia/aura/neuro deficit]. Worst headache of life: [yes/no].',
    text_ar: 'صداع. البداية: [حاد/تدريجي]. الموقع: [جبهي/صدغي/قذالي/منتشر]. الطبيعة: [نابض/ضاغط/حاد]. الشدة: [/10]. مصاحب: [غثيان/رهاب ضوء/صوت/أعراض عصبية]. أسوأ صداع في الحياة: [نعم/لا].'
  },
  'dizziness': {
    label: 'Dizziness', ar: 'دوخة',
    text_en: 'Dizziness. Type: [vertigo/pre-syncope/disequilibrium/lightheadedness]. Triggers: [position change/movement/standing]. Associated: [nausea/hearing loss/tinnitus/neuro deficit].',
    text_ar: 'دوخة. النوع: [دوار/إغماء وشيك/اختلال توازن/خفة رأس]. المحفزات: [تغيير الوضع/الحركة/الوقوف]. مصاحب: [غثيان/فقد سمع/طنين/عجز عصبي].'
  },
  'nausea_vomit': {
    label: 'Nausea & Vomiting', ar: 'غثيان وقيء',
    text_en: 'N/V duration [hours/days]. Frequency: [# per hour/day]. Content: [bilious/bloody/coffee-ground/fecal]. Associated: [abd pain/diarrhea/fever/headache]. Tolerating PO: [yes/no].',
    text_ar: 'غثيان وقيء لمدة [ساعات/أيام]. التكرار: [العدد في الساعة/اليوم]. المحتوى: [صفراوي/دموي/بنّي/برازي]. مصاحب: [ألم بطن/إسهال/حمى/صداع]. يتحمل عن طريق الفم: [نعم/لا].'
  },
  'diarrhea': {
    label: 'Diarrhea', ar: 'إسهال',
    text_en: 'Diarrhea onset [time]. Frequency: [# stools/day]. Character: [watery/loose/bloody]. Associated: [fever/abd pain/N/V]. Travel/sick contacts: [yes/no]. Antibiotic use last 3 months: [yes/no].',
    text_ar: 'بداية الإسهال [الوقت]. التكرار: [عدد/يوم]. الطبيعة: [مائي/رخو/دموي]. مصاحب: [حمى/ألم بطن/غثيان]. سفر/مخالطين: [نعم/لا]. استخدام مضادات حيوية آخر 3 أشهر: [نعم/لا].'
  },
  'syncope': {
    label: 'Syncope', ar: 'إغماء',
    text_en: 'Syncope episode. Prodrome: [yes/no, symptoms]. Loss of consciousness duration: [seconds]. Trigger: [exertion/standing/emotion/none]. Tongue biting: [yes/no]. Incontinence: [yes/no]. Post-event confusion: [yes/no, duration].',
    text_ar: 'نوبة إغماء. أعراض تحذيرية: [نعم/لا، الأعراض]. مدة فقدان الوعي: [ثوان]. المحفز: [مجهود/وقوف/انفعال/لا يوجد]. عض اللسان: [نعم/لا]. سلس: [نعم/لا]. تشوش بعد الحادث: [نعم/لا، المدة].'
  },
  'rash': {
    label: 'Rash', ar: 'طفح جلدي',
    text_en: 'Rash onset [time]. Location: [distribution]. Character: [macular/papular/vesicular/petechial]. Pruritic: [yes/no]. Associated: [fever/joint pain/mucosal involvement]. Recent: [new med/exposure/infection].',
    text_ar: 'بداية الطفح [الوقت]. الموقع: [التوزيع]. الطبيعة: [بقعي/حطاطي/حويصلي/نمشي]. حكة: [نعم/لا]. مصاحب: [حمى/ألم مفاصل/إصابة مخاطية]. حديث: [دواء جديد/تعرض/عدوى].'
  },
  // ---- More Chronic Conditions ----
  'cad': {
    label: 'CAD Note', ar: 'مرض شرايين تاجية',
    text_en: 'CAD: prior MI [yes/no, year], CABG/PCI [year, vessels], current symptoms [stable angina/USA/none]. CCS class: [I/II/III/IV]. Current meds: [aspirin/statin/beta-blocker/ACEi]. Last echo: [EF, date].',
    text_ar: 'مرض الشرايين التاجية: نوبة قلبية سابقة [نعم/لا، السنة]، عملية مجازة/قسطرة [السنة، الأوعية]، الأعراض الحالية [ذبحة مستقرة/غير مستقرة/لا توجد]. تصنيف CCS: [I/II/III/IV]. الأدوية: [أسبرين/ستاتين/حاصرات بيتا/ACEi]. آخر إيكو: [EF، التاريخ].'
  },
  'chf': {
    label: 'CHF Note', ar: 'فشل قلبي احتقاني',
    text_en: 'CHF, NYHA class [I/II/III/IV]. EF [%], last echo [date]. Etiology: [ischemic/HTN/valvular/idiopathic]. Compliant with: [Lasix/spironolactone/BB/ACEi]. Recent fluid status: [euvolemic/overloaded].',
    text_ar: 'فشل قلبي، تصنيف NYHA [I/II/III/IV]. كسر القذف [%]، آخر إيكو [التاريخ]. السبب: [إقفاري/ضغط/صمامي/مجهول]. ملتزم بـ: [لازكس/سبيرونولاكتون/بيتا/ACEi]. حالة السوائل الأخيرة: [طبيعي/زائد].'
  },
  'afib': {
    label: 'Atrial Fibrillation', ar: 'رجفان أذيني',
    text_en: 'AFib: paroxysmal/persistent/permanent. CHA2DS2-VASc score [/9]. HAS-BLED score [/9]. On anticoag: [warfarin/DOAC/none]. Rate control: [BB/CCB/digoxin]. Symptoms: [palpitations/SOB/none].',
    text_ar: 'رجفان أذيني: نوبي/مستمر/دائم. درجة CHA2DS2-VASc [/9]. درجة HAS-BLED [/9]. على مضاد تجلط: [وارفارين/مضاد تجلط حديث/لا]. ضبط المعدل: [بيتا/CCB/ديجوكسين]. الأعراض: [خفقان/ضيق نفس/لا توجد].'
  },
  'copd': {
    label: 'COPD Note', ar: 'انسداد رئوي مزمن',
    text_en: 'COPD GOLD stage [I/II/III/IV]. FEV1 [%]. Exacerbations last year: [#]. Home O2: [yes/no, LPM]. Current meds: [SABA/LABA/LAMA/ICS]. Smoking status: [active/former, pack-years].',
    text_ar: 'انسداد رئوي مزمن مرحلة GOLD [I/II/III/IV]. FEV1 [%]. النوبات السنة الماضية: [العدد]. أكسجين منزلي: [نعم/لا، لتر/دقيقة]. الأدوية: [SABA/LABA/LAMA/ICS]. حالة التدخين: [نشط/سابق، سنة-عبوة].'
  },
  'asthma': {
    label: 'Asthma Note', ar: 'ربو',
    text_en: 'Asthma: well-controlled/partially-controlled/uncontrolled. Daytime symptoms [<2x/wk vs daily]. Night symptoms [/month]. SABA use [/wk]. Last ED visit/admission [date]. Triggers: [allergens/exercise/cold/URI].',
    text_ar: 'ربو: مضبوط جيداً/جزئياً/غير مضبوط. أعراض نهارية [<2/أسبوع مقابل يومي]. أعراض ليلية [/شهر]. استخدام SABA [/أسبوع]. آخر طوارئ/إدخال [التاريخ]. المحفزات: [حساسية/تمرين/برد/عدوى].'
  },
  // ---- Surgical / Procedural ----
  'preop': {
    label: 'Pre-Op Note', ar: 'ملاحظة ما قبل الجراحة',
    text_en: 'Pre-op for [procedure]. Indication: [reason]. ASA class: [I/II/III/IV/V]. Labs reviewed: [CBC/CMP/PT-INR/CXR/ECG]. Consent signed: [yes]. NPO since [time]. Antibiotic prophylaxis: [drug]. Allergies reviewed.',
    text_ar: 'تقييم ما قبل الجراحة لـ [الإجراء]. الاستطباب: [السبب]. تصنيف ASA: [I/II/III/IV/V]. التحاليل مراجعة: [CBC/CMP/PT-INR/أشعة صدر/تخطيط قلب]. الموافقة موقعة: [نعم]. صائم منذ [الوقت]. مضاد حيوي وقائي: [الدواء]. الحساسيات مراجعة.'
  },
  'postop': {
    label: 'Post-Op Note', ar: 'ملاحظة ما بعد الجراحة',
    text_en: 'POD#[number] s/p [procedure]. Vitals stable. Pain controlled on [regimen]. Diet: [advance/NPO/clear]. Activity: [bed/chair/ambulate]. Wound: [clean/dry/intact]. Drains: [type, output]. Plan: [discharge/D/C foley/PT].',
    text_ar: 'اليوم #[الرقم] بعد الجراحة [الإجراء]. علامات حيوية مستقرة. الألم مضبوط بـ [الخطة]. الحمية: [تدرج/صائم/سوائل]. النشاط: [سرير/كرسي/مشي]. الجرح: [نظيف/جاف/سليم]. التصاريف: [النوع، الكمية]. الخطة: [خروج/إيقاف قسطرة/علاج طبيعي].'
  },
  'procedure': {
    label: 'Procedure Note', ar: 'ملاحظة إجراء',
    text_en: 'Procedure: [name]. Indication: [reason]. Consent: written/verbal. Time-out completed. Anesthesia: [local/regional/sedation/GA]. Findings: [results]. Complications: [none/list]. Post-procedure: stable, [tolerated well/in PACU].',
    text_ar: 'إجراء: [الاسم]. الاستطباب: [السبب]. الموافقة: مكتوبة/شفهية. تم التحقق قبل البدء. التخدير: [موضعي/إقليمي/تخدير/عام]. النتائج: [النتائج]. المضاعفات: [لا توجد/قائمة]. ما بعد الإجراء: مستقر، [يتحمل جيداً/في الإفاقة].'
  },
  // ---- ICU specific ----
  'icu_admit': {
    label: 'ICU Admission', ar: 'إدخال العناية المركزة',
    text_en: 'ICU admission for [reason]. APACHE II: [score]. Lines: [arterial/central/PICC]. Ventilation: [room air/NC/HFNC/NIV/intubated]. Sedation: [drug, RASS goal]. Pressors: [drug, dose]. Antibiotics: [drug, day#]. DVT prophylaxis: [yes].',
    text_ar: 'إدخال العناية المركزة لـ [السبب]. APACHE II: [الدرجة]. القساطر: [شرياني/مركزي/PICC]. التهوية: [هواء/أنبوب/NIV/تنبيب]. التهدئة: [الدواء، هدف RASS]. ضواغط: [الدواء، الجرعة]. مضادات حيوية: [الدواء، اليوم#]. وقاية تجلط: [نعم].'
  },
  'vent_check': {
    label: 'Ventilator Check', ar: 'فحص جهاز التنفس',
    text_en: 'Vent settings: mode [AC/PSV/SIMV], VT [mL], rate [/min], PEEP [cmH2O], FiO2 [%]. ABG: pH [], PaO2 [], PaCO2 [], HCO3 []. SpO2 [%]. PIP [], Plateau []. Weaning trial: [readiness assessed].',
    text_ar: 'إعدادات الجهاز: النمط [AC/PSV/SIMV]، VT [مل]، المعدل [/دقيقة]، PEEP [سم ماء]، FiO2 [%]. غازات الدم: pH []، PaO2 []، PaCO2 []، HCO3 []. SpO2 [%]. PIP []، الهضبة []. تجربة الفطام: [الجاهزية تم تقييمها].'
  },
  // ---- Pediatric ----
  'peds_well': {
    label: 'Peds Well-Child', ar: 'فحص طفل سليم',
    text_en: 'Well-child visit, age [months/years]. Weight [%ile], Height [%ile], HC [%ile if <2y]. Development: [age-appropriate milestones]. Vaccines: [up-to-date/needed today]. Anticipatory guidance reviewed.',
    text_ar: 'زيارة طفل سليم، العمر [شهور/سنوات]. الوزن [النسبة المئوية]، الطول [النسبة]، محيط الرأس [النسبة إن <2 سنة]. النمو: [مراحل متناسبة مع العمر]. اللقاحات: [محدثة/مطلوبة اليوم]. التوجيهات الاستباقية تم مراجعتها.'
  },
  'peds_fever': {
    label: 'Pediatric Fever', ar: 'حمى الأطفال',
    text_en: 'Pediatric fever, age [months/years], Tmax [°C]. Duration [hours/days]. Source screened: [URI/AOM/UTI/strep]. Wet diapers/voiding: [normal/decreased]. PO intake: [adequate/poor]. Activity: [normal/lethargic].',
    text_ar: 'حمى أطفال، العمر [شهور/سنوات]، الحرارة العظمى [°م]. المدة [ساعات/أيام]. المصدر تم البحث: [التهاب علوي/أذن/مسالك/حلق]. الحفاضات/التبول: [طبيعي/قليل]. التغذية الفموية: [كافية/ضعيفة]. النشاط: [طبيعي/خامل].'
  },
  // ---- OB/GYN ----
  'pregnancy': {
    label: 'Pregnancy Note', ar: 'ملاحظة حمل',
    text_en: 'G[#]P[#]A[#], GA [weeks]. EDD [date]. Recent ultrasound: [date, findings]. Vital signs WNL. Fundal height [cm]. Fetal heart tones [bpm]. Movement: [present/decreased]. Symptoms: [denies bleeding/cramping/leaking fluid].',
    text_ar: 'G[#]P[#]A[#]، عمر الحمل [أسبوع]. تاريخ الولادة المتوقع [التاريخ]. آخر سونار: [التاريخ، النتائج]. علامات حيوية طبيعية. ارتفاع الرحم [سم]. نبضات قلب الجنين [/دقيقة]. الحركة: [موجودة/ناقصة]. الأعراض: [ينفي نزيف/مغص/تسرب سائل].'
  },
  // ---- Mental Health ----
  'depression_screen': {
    label: 'Depression Screen', ar: 'فحص اكتئاب',
    text_en: 'PHQ-9 score [/27]: minimal (0-4)/mild (5-9)/moderate (10-14)/moderately severe (15-19)/severe (20-27). SI: denies/passive/active with plan. Sleep [hours], appetite [N/decreased/increased]. Energy [N/decreased].',
    text_ar: 'درجة PHQ-9 [/27]: لا يوجد (0-4)/خفيف (5-9)/متوسط (10-14)/متوسط شديد (15-19)/شديد (20-27). أفكار انتحارية: ينفي/سلبية/فعالة مع خطة. النوم [ساعات]، الشهية [طبيعية/منخفضة/زائدة]. الطاقة [طبيعية/منخفضة].'
  },
  'anxiety_screen': {
    label: 'Anxiety Screen', ar: 'فحص قلق',
    text_en: 'GAD-7 score [/21]: minimal (0-4)/mild (5-9)/moderate (10-14)/severe (15-21). Triggers: [identified/none]. Functional impact: [work/school/relationships]. Currently on: [therapy/SSRI/benzo/none].',
    text_ar: 'درجة GAD-7 [/21]: لا يوجد (0-4)/خفيف (5-9)/متوسط (10-14)/شديد (15-21). المحفزات: [محددة/لا توجد]. التأثير الوظيفي: [العمل/الدراسة/العلاقات]. حالياً على: [علاج/SSRI/مضاد قلق/لا شيء].'
  },
  // ---- Nursing additions ----
  'iv_insert': {
    label: 'IV Insertion', ar: 'تركيب وريد محيطي',
    text_en: 'IV placed in [site], gauge [#]. Patent, no signs of infiltration/phlebitis. Saline lock applied. Patient tolerated procedure well. Site to be monitored q4h.',
    text_ar: 'تم تركيب وريد محيطي في [الموقع]، مقاس [#]. سالك، لا توجد علامات تسرب/التهاب وريد. تم تركيب قفل ملحي. تحمل المريض الإجراء جيداً. سيتم مراقبة الموقع كل 4 ساعات.'
  },
  'wound_care': {
    label: 'Wound Care', ar: 'رعاية الجرح',
    text_en: 'Wound location: [site]. Size: [LxWxD cm]. Wound bed: [pink/red/yellow/black]. Exudate: [none/serous/sanguineous/purulent, amount]. Periwound: [intact/erythematous/macerated]. Dressing change: [type] applied.',
    text_ar: 'موقع الجرح: [الموقع]. الحجم: [طول×عرض×عمق سم]. قاع الجرح: [وردي/أحمر/أصفر/أسود]. الإفراز: [لا يوجد/مصلي/دموي/قيحي، الكمية]. حول الجرح: [سليم/محمر/متعجن]. تغيير الضمادة: [النوع] تم.'
  },
  'fall_risk': {
    label: 'Fall Risk Assessment', ar: 'تقييم خطر السقوط',
    text_en: 'Morse Fall Scale: [score]. Risk: [low<25/medium 25-50/high>50]. Interventions: [bed alarm/non-slip socks/sitter/yellow band/call light within reach/bed in lowest position].',
    text_ar: 'مقياس سقوط Morse: [الدرجة]. الخطر: [منخفض<25/متوسط 25-50/مرتفع>50]. التدخلات: [إنذار سرير/جوارب غير منزلقة/مرافق/سوار أصفر/زر النداء قريب/السرير في أدنى وضع].'
  },
  'restraint': {
    label: 'Restraint Documentation', ar: 'توثيق التقييد',
    text_en: 'Restraint applied: [type, location] for [reason]. Less restrictive interventions tried: [yes/no, list]. Patient/family informed: [yes]. MD order obtained. Monitor q15min for circulation/skin/safety. ROM provided.',
    text_ar: 'تم تطبيق التقييد: [النوع، الموقع] بسبب [السبب]. تدخلات أقل تقييدية تم تجربتها: [نعم/لا، القائمة]. المريض/الأسرة تم إخطارهم: [نعم]. طلب الطبيب تم الحصول عليه. مراقبة كل 15 دقيقة للدورة/الجلد/السلامة. تمارين تم تقديمها.'
  },
  'pacu': {
    label: 'PACU Note', ar: 'ملاحظة الإفاقة',
    text_en: 'Patient arrived from OR. LOC: [alert/drowsy]. VS stable. Aldrete score [/10]: activity, respiration, circulation, consciousness, O2 sat. Pain [/10]. Ready for transfer when: Aldrete ≥9, pain controlled.',
    text_ar: 'وصل المريض من غرفة العمليات. مستوى الوعي: [يقظ/نعسان]. علامات حيوية مستقرة. درجة Aldrete [/10]: نشاط، تنفس، دورة، وعي، أكسجين. الألم [/10]. جاهز للنقل عند: Aldrete ≥9، الألم مضبوط.'
  },
  // ---- ED specific ----
  'triage': {
    label: 'Triage Note', ar: 'ملاحظة فرز',
    text_en: 'Triage level: ESI [1/2/3/4/5]. Chief complaint: [CC]. Arrival: [walked-in/EMS/wheelchair]. VS: [list]. Pain [/10]. Acuity assessment: [requires immediate/urgent/non-urgent care].',
    text_ar: 'مستوى الفرز: ESI [1/2/3/4/5]. الشكوى الرئيسية: [الشكوى]. الوصول: [مشي/إسعاف/كرسي متحرك]. علامات حيوية: [القائمة]. الألم [/10]. تقييم الحدة: [يتطلب رعاية فورية/عاجلة/غير عاجلة].'
  },
  'stroke': {
    label: 'Stroke Workup', ar: 'تقييم سكتة',
    text_en: 'Possible stroke. Time last known well: [time]. NIHSS [/42]. Symptoms: [hemiparesis/dysarthria/aphasia/visual]. Stat CT head: [done/pending]. tPA candidate: [yes/no, contraindications]. Blood glucose [], BP []. Stroke team notified.',
    text_ar: 'احتمال سكتة دماغية. آخر وقت طبيعي معروف: [الوقت]. NIHSS [/42]. الأعراض: [شلل نصفي/عسر تلفظ/حبسة/بصري]. CT دماغ عاجل: [تم/قيد الانتظار]. مرشح لمذيب الجلطة: [نعم/لا، موانع]. سكر الدم []، الضغط []. فريق السكتة تم إخطاره.'
  },
  'dka': {
    label: 'DKA Management', ar: 'إدارة الحماض السكري',
    text_en: 'DKA criteria met: BG [], pH [], HCO3 [], anion gap [], ketones [+++]. Started: IVF NS bolus, insulin gtt [0.1U/kg/hr], K+ replacement [if K<5.3], q1h glucose/q2h BMP. Monitor for cerebral edema.',
    text_ar: 'معايير الحماض السكري مستوفاة: السكر []، pH []، HCO3 []، فجوة الأنيون []، الكيتونات [+++]. تم البدء: محاليل وريدية ملحي، إنسولين قطرة [0.1وحدة/كجم/ساعة]، تعويض K+ [إذا K<5.3]، سكر/ساعة كيمياء/ساعتين. مراقبة الوذمة الدماغية.'
  },
  // ---- Quick communication ----
  'phone_md': {
    label: 'Phone Call to MD', ar: 'مكالمة للطبيب',
    text_en: 'Called Dr. [name] at [time] for [reason]. Reported: [SBAR summary]. Orders received: [list]. Read-back verified. Documented in [med/order sheet].',
    text_ar: 'تم الاتصال بالطبيب [الاسم] في [الوقت] بسبب [السبب]. تم إبلاغ: [ملخص SBAR]. الأوامر الواردة: [القائمة]. تم التحقق بالقراءة المضادة. تم التوثيق في [الدواء/ورقة الأوامر].'
  },
  'rounding': {
    label: 'Rounding Note', ar: 'ملاحظة الجولة',
    text_en: 'Rounded with [team]. Reviewed: vitals, labs, meds, plan. Updates discussed: [list]. Family questions addressed. Goals for today: [list]. Discharge planning: [in progress/needs SW/needs PT].',
    text_ar: 'تم الجولة مع [الفريق]. تم مراجعة: علامات حيوية، تحاليل، أدوية، الخطة. التحديثات نوقشت: [القائمة]. أسئلة الأسرة تم الرد عليها. أهداف اليوم: [القائمة]. تخطيط الخروج: [قيد التنفيذ/يحتاج اجتماعي/علاج طبيعي].'
  },
  // ---- More acute presentations ----
  'allergic_reaction': {
    label: 'Allergic Reaction', ar: 'تفاعل تحسسي',
    text_en: 'Allergic reaction. Trigger suspected: [food/drug/insect/contact]. Symptoms: [urticaria/angioedema/wheezing/hypotension/shock]. Treatment: [diphenhydramine/epinephrine/steroids]. Severity: [mild/moderate/anaphylaxis].',
    text_ar: 'تفاعل تحسسي. المحفز المشتبه: [طعام/دواء/حشرة/تلامس]. الأعراض: [شرى/وذمة وعائية/صفير/ضغط منخفض/صدمة]. العلاج: [ديفن هايدرامين/إبينفرين/كورتيزون]. الشدة: [خفيف/متوسط/تأق].'
  },
  'gi_bleed': {
    label: 'GI Bleed', ar: 'نزيف هضمي',
    text_en: 'GI bleed: upper (hematemesis/melena) vs lower (BRBPR). Onset [time]. Estimated volume: [small/moderate/large]. Hemodynamics: BP [], HR []. Hgb on arrival: []. Type & cross sent. GI consult notified. NPO. PPI gtt started.',
    text_ar: 'نزيف هضمي: علوي (قيء دموي/براز قطراني) مقابل سفلي (دم أحمر فاتح). البداية [الوقت]. الكمية المقدرة: [قليلة/متوسطة/كبيرة]. الديناميكية: الضغط []، النبض []. هيموجلوبين عند الوصول: []. زمرة دم تم إرسالها. استشارة هضمية. صائم. مثبط حموضة وريدي بدأ.'
  },
  // ---- Vitals quick comment ----
  'vitals_stable': {
    label: 'Vitals Stable', ar: 'علامات حيوية مستقرة',
    text_en: 'Vital signs stable and within normal limits. BP [/], HR [], RR [], Temp [°C], SpO2 [%] on room air. Patient comfortable, in NAD.',
    text_ar: 'العلامات الحيوية مستقرة وضمن الحدود الطبيعية. الضغط [/]، النبض []، التنفس []، الحرارة [°م]، الأكسجين [%] على هواء الغرفة. المريض مرتاح، لا توجد ضائقة حادة.'
  },
  'vitals_unstable': {
    label: 'Vitals Unstable', ar: 'علامات حيوية غير مستقرة',
    text_en: 'ABNORMAL vital signs: BP [/], HR [], RR [], Temp [°C], SpO2 [%]. Provider notified at [time]. Interventions: [list]. Continued monitoring q15min until stable.',
    text_ar: 'علامات حيوية غير طبيعية: الضغط [/]، النبض []، التنفس []، الحرارة [°م]، الأكسجين [%]. تم إخطار الطبيب في [الوقت]. التدخلات: [القائمة]. مراقبة مستمرة كل 15 دقيقة حتى الاستقرار.'
  },
  // ---- Code Blue summary ----
  'code_blue': {
    label: 'Code Blue Event', ar: 'حدث Code Blue',
    text_en: 'Code Blue called at [time] for [reason]. CPR initiated [time]. Rhythm: [VFib/VT/asystole/PEA]. Defibrillation [#] times. Meds: [epi #/amio/atropine]. ROSC achieved at [time] / patient pronounced at [time]. Family notified.',
    text_ar: 'تم استدعاء Code Blue في [الوقت] بسبب [السبب]. CPR بدأ [الوقت]. الإيقاع: [VFib/VT/توقف/PEA]. صدمة كهربائية [#] مرات. الأدوية: [إبي #/أميودارون/أتروبين]. عودة النبض في [الوقت] / تم إعلان الوفاة في [الوقت]. الأسرة تم إخطارها.'
  }
};

// ============================================================
// Smart Phrases UI
// ============================================================

let _smartPhraseState = { textarea: null, popup: null, anchor: -1, selectedIdx: 0, matches: [] };

function _smartPhraseGetLang() {
  return typeof currentLanguage === 'function' ? currentLanguage() : 'en';
}

function _smartPhraseDestroyPopup() {
  if (_smartPhraseState.popup) {
    _smartPhraseState.popup.remove();
    _smartPhraseState.popup = null;
  }
  _smartPhraseState.textarea = null;
  _smartPhraseState.anchor = -1;
  _smartPhraseState.matches = [];
  _smartPhraseState.selectedIdx = 0;
}

function _smartPhraseMatch(query) {
  query = query.toLowerCase();
  return Object.entries(SMART_PHRASES)
    .filter(([key, val]) => {
      if (!query) return true;
      return key.toLowerCase().includes(query)
        || val.label.toLowerCase().includes(query);
    })
    .slice(0, 8);
}

function _smartPhraseRenderPopup() {
  const lang = _smartPhraseGetLang();
  const popup = _smartPhraseState.popup;
  if (!popup) return;
  const matches = _smartPhraseState.matches;
  const selectedIdx = _smartPhraseState.selectedIdx;

  if (matches.length === 0) {
    popup.innerHTML = `<div class="smart-phrase-item" style="color:#9ca3af">${lang==='ar'?'لا توجد قوالب':'No templates found'}</div>`;
    return;
  }

  popup.innerHTML = matches.map(([key, val], i) => {
    const preview = (lang === 'ar' ? val.text_ar : val.text_en).substring(0, 80) + '...';
    const label = lang === 'ar' ? val.ar : val.label;
    return `<div class="smart-phrase-item ${i === selectedIdx ? 'selected' : ''}"
              onmousedown="selectSmartPhrase('${key}')"
              onmouseenter="_smartPhraseHover(${i})">
      <span class="sp-shortcut">/${key}</span><strong>${escapeHtml ? escapeHtml(label) : label}</strong>
      <span class="sp-preview">${escapeHtml ? escapeHtml(preview) : preview}</span>
    </div>`;
  }).join('');
}

function _smartPhraseHover(idx) {
  _smartPhraseState.selectedIdx = idx;
  _smartPhraseRenderPopup();
}

function selectSmartPhrase(key) {
  const phrase = SMART_PHRASES[key];
  if (!phrase || !_smartPhraseState.textarea) return;
  const lang = _smartPhraseGetLang();
  const ta = _smartPhraseState.textarea;
  const anchor = _smartPhraseState.anchor;
  const text = ta.value;
  const replaceText = lang === 'ar' ? phrase.text_ar : phrase.text_en;

  // Replace the "/shortcut" with the full template
  const before = text.substring(0, anchor);
  const cursorPos = ta.selectionStart;
  const after = text.substring(cursorPos);
  ta.value = before + replaceText + after;
  // Place cursor at end of inserted text
  const newPos = before.length + replaceText.length;
  ta.setSelectionRange(newPos, newPos);
  ta.focus();
  _smartPhraseDestroyPopup();
}

function _smartPhraseHandleKey(e) {
  const ta = e.target;
  if (!(ta instanceof HTMLTextAreaElement) && ta.type !== 'text') return;
  // Only on textareas or text inputs flagged with class
  if (ta.tagName !== 'TEXTAREA' && !ta.classList.contains('sp-input')) return;

  // ESC closes
  if (e.key === 'Escape' && _smartPhraseState.popup) {
    e.preventDefault();
    _smartPhraseDestroyPopup();
    return;
  }

  // Navigation while popup open
  if (_smartPhraseState.popup && _smartPhraseState.textarea === ta) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _smartPhraseState.selectedIdx = Math.min(
        _smartPhraseState.matches.length - 1,
        _smartPhraseState.selectedIdx + 1
      );
      _smartPhraseRenderPopup();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      _smartPhraseState.selectedIdx = Math.max(0, _smartPhraseState.selectedIdx - 1);
      _smartPhraseRenderPopup();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (_smartPhraseState.matches.length > 0) {
        e.preventDefault();
        selectSmartPhrase(_smartPhraseState.matches[_smartPhraseState.selectedIdx][0]);
        return;
      }
    }
  }
}

function _smartPhraseHandleInput(e) {
  const ta = e.target;
  if (ta.tagName !== 'TEXTAREA' && !ta.classList.contains('sp-input')) return;

  const value = ta.value;
  const cursor = ta.selectionStart;
  // Look back for "/" that starts a shortcut
  let slashIdx = -1;
  for (let i = cursor - 1; i >= 0 && i >= cursor - 30; i--) {
    const ch = value[i];
    if (ch === '/') { slashIdx = i; break; }
    if (ch === ' ' || ch === '\n' || ch === '\t') break;
  }
  if (slashIdx === -1) {
    _smartPhraseDestroyPopup();
    return;
  }
  // Don't trigger if it's a URL-style "://"
  if (value.substring(slashIdx, slashIdx + 2) === '//' ||
      (slashIdx > 0 && value[slashIdx - 1] === ':')) {
    _smartPhraseDestroyPopup();
    return;
  }

  const query = value.substring(slashIdx + 1, cursor);
  if (query.length > 20 || /[\s\n]/.test(query)) {
    _smartPhraseDestroyPopup();
    return;
  }

  const matches = _smartPhraseMatch(query);
  if (matches.length === 0 && query.length > 0) {
    _smartPhraseDestroyPopup();
    return;
  }

  _smartPhraseState.textarea = ta;
  _smartPhraseState.anchor = slashIdx;
  _smartPhraseState.matches = matches;
  _smartPhraseState.selectedIdx = 0;

  if (!_smartPhraseState.popup) {
    const popup = document.createElement('div');
    popup.className = 'smart-phrase-popup';
    document.body.appendChild(popup);
    _smartPhraseState.popup = popup;
  }

  // Position popup near textarea cursor
  const rect = ta.getBoundingClientRect();
  const popup = _smartPhraseState.popup;
  popup.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  popup.style.left = (rect.left + window.scrollX) + 'px';
  popup.style.maxWidth = Math.max(280, rect.width) + 'px';

  _smartPhraseRenderPopup();
}

function _smartPhraseHandleBlur(e) {
  // Slight delay to allow click on popup item
  setTimeout(() => {
    if (_smartPhraseState.popup && document.activeElement !== _smartPhraseState.textarea) {
      _smartPhraseDestroyPopup();
    }
  }, 150);
}

// ---- Initialize globally ----
document.addEventListener('input', _smartPhraseHandleInput);
document.addEventListener('keydown', _smartPhraseHandleKey, true);
document.addEventListener('focusout', _smartPhraseHandleBlur);


