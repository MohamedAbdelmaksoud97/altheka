-- Full source-aligned templates. They remain drafts until operational acceptance.

insert into public.workflow_templates (
  organization_id, name, slug, workflow_type, is_active
)
select organization.id, template.name, template.slug, template.workflow_type, true
from public.organizations organization
cross join (
  values
    ('ما قبل التعاقد v2', 'pre-contract-v2', 'pre_contract'),
    ('إدارة مشروع التقاضي v2', 'litigation-v2', 'litigation'),
    ('تصفية التركات الرئيسية v2', 'estate-v2', 'estate'),
    ('مشروع أصل التركة v2', 'estate-asset-v2', 'estate_asset')
) as template(name, slug, workflow_type)
on conflict (organization_id, slug) do update
set name = excluded.name, is_active = true, updated_at = now();

insert into public.workflow_template_versions (
  workflow_template_id, version_number, status, transition_dsl
)
select template.id, 2, 'draft',
  case template.slug
    when 'pre-contract-v2' then jsonb_build_object(
      'source', 'litigation-map-stage-1',
      'conversion_guard', jsonb_build_object(
        'requires_current_contract_acceptance', true,
        'accepted_methods', jsonb_build_array('electronic', 'manual_signed_copy')
      )
    )
    when 'litigation-v2' then jsonb_build_object(
      'source', 'litigation-map-stages-2-7',
      'requires_next_action_for_active_case', true,
      'supports', jsonb_build_array('events', 'recurrence', 'approval', 'revision', 'override', 'reopen')
    )
    when 'estate-v2' then jsonb_build_object(
      'source', 'estate-liquidation-map',
      'asset_subprojects', true,
      'critical_path', true,
      'parallel_stages', jsonb_build_array('guardianship', 'estate_litigation', 'liquidation', 'marketing')
    )
    else jsonb_build_object(
      'source', 'estate-liquidation-map-asset-scope',
      'independent_asset_stage', true,
      'critical_path', true
    )
  end
from public.workflow_templates template
where template.slug in ('pre-contract-v2', 'litigation-v2', 'estate-v2', 'estate-asset-v2')
on conflict (workflow_template_id, version_number) do nothing;

-- Litigation source stages: stage 1 belongs to Service Request; stages 2-7 to Project.
with stage_data(template_slug, code, name, position, target_duration, maximum_duration, stage_mode, close_rule, optional) as (
  values
    ('pre-contract-v2', 'pre_contract', 'ما قبل توقيع العقد', 1, null, null, 'sequential', 'required_actions', false),
    ('litigation-v2', 'congratulations', 'التهنئة', 1, '2 days', null, 'sequential', 'required_actions', false),
    ('litigation-v2', 'foundation_registration', 'التأسيس والتقييد', 2, '5 days', null, 'sequential', 'required_actions', false),
    ('litigation-v2', 'first_instance', 'المرافعة الابتدائية', 3, null, null, 'sequential', 'required_actions', false),
    ('litigation-v2', 'appeal', 'الاستئناف', 4, null, null, 'conditional', 'manual_approval', true),
    ('litigation-v2', 'enforcement', 'التنفيذ', 5, null, null, 'conditional', 'manual_approval', true),
    ('litigation-v2', 'closing_collection', 'الإقفال والتحصيل', 6, '10 days', null, 'sequential', 'manual_approval', false)
)
insert into public.workflow_stage_templates (
  workflow_template_version_id, code, name, position, target_duration,
  maximum_duration, is_optional, close_rule, stage_mode, source_reference
)
select version.id, stage.code, stage.name, stage.position,
  stage.target_duration::interval, stage.maximum_duration::interval,
  stage.optional, stage.close_rule, stage.stage_mode,
  'خارطة التقاضي/' || stage.code
from stage_data stage
join public.workflow_templates template on template.slug = stage.template_slug
join public.workflow_template_versions version
  on version.workflow_template_id = template.id and version.version_number = 2
on conflict (workflow_template_version_id, code) do nothing;

with action_data(
  template_slug, stage_code, code, name, position, duration_text, duration_basis,
  schedule_type, recurrence_rule, priority, visibility, source_reference, noc, executor_kind
) as (
  values
    ('pre-contract-v2','pre_contract','receive_client','استقبال العميل أو اتصاله',1,'0 days','business_days','event','{}','normal','client_visible','LT-1-01',false,'new_clients_manager'),
    ('pre-contract-v2','pre_contract','assign_and_meet','تحديد المكلف والاجتماع وتحديد المسار والخدمة',2,'1 day','business_days','once','{}','high','client_visible','LT-1-02',false,'eligible_study_assignee'),
    ('pre-contract-v2','pre_contract','request_documents','طلب المستندات',3,'1 day','business_days','once','{}','normal','requires_client_action','LT-1-03',false,'eligible_study_assignee'),
    ('pre-contract-v2','pre_contract','follow_new_clients_register','متابعة سجل العملاء الجدد',4,'1 day','business_days','recurring','{"frequency":"daily","business_days":true}','normal','internal','LT-1-04',false,'new_clients_manager'),
    ('pre-contract-v2','pre_contract','study_and_offer','دراسة الطلب وإعداد العرض الفني والمالي',5,'1 day','business_days','once','{"extension_max_hours":24}','high','client_visible','LT-1-05',false,'eligible_study_assignee'),
    ('pre-contract-v2','pre_contract','follow_client','متابعة العميل على العرض',6,'2 days','business_days','once','{}','normal','client_visible','LT-1-06',false,'new_clients_manager'),
    ('pre-contract-v2','pre_contract','negotiate','التفاوض والتخفيض',7,'2 days','business_days','once','{}','high','client_visible','LT-1-07',false,'new_clients_manager'),
    ('pre-contract-v2','pre_contract','draft_discuss_sign_contract','صياغة العقد ومناقشته والتوقيع',8,'2 days','business_days','once','{}','high','requires_client_action','LT-1-08',false,'eligible_study_assignee'),

    ('litigation-v2','congratulations','prepare_congratulations_package','إعداد خطاب التهنئة والفهرس ومسودة الفاتورة وإتاحة العقد والوكالة',1,'2 days','business_days','once','{}','high','client_visible','LT-2-01',false,'litigation_secretary'),
    ('litigation-v2','congratulations','number_contract_project','إنشاء وترقيم العقد والمشروع',2,'1 day','business_days','once','{}','normal','internal','LT-2-02',false,'litigation_secretary'),
    ('litigation-v2','congratulations','create_channels','إنشاء قناة العميل والقناة الداخلية',3,'0 days','business_days','event','{}','normal','client_visible','LT-2-03',false,'litigation_secretary'),
    ('litigation-v2','congratulations','assign_case','تعيين المكلف الرئيسي في القضية',4,'1 day','business_days','once','{}','high','client_visible','LT-2-04',false,'litigation_secretary'),
    ('litigation-v2','congratulations','index_store_documents','فهرسة ورفع المستندات إلى Storage الخاص',5,'1 day','business_days','once','{}','normal','internal','LT-2-05',false,'litigation_secretary'),
    ('litigation-v2','congratulations','register_paper_original','تسجيل أصل العقد الورقي وموقع حفظه',6,'1 day','business_days','once','{}','normal','internal','LT-2-06',false,'litigation_secretary'),
    ('litigation-v2','congratulations','register_contact_data','تسجيل بيانات تواصل العميل',7,'1 day','business_days','once','{}','normal','internal','LT-2-07',false,'litigation_secretary'),
    ('litigation-v2','congratulations','opening_message_start_map','إنشاء الرسالة الافتتاحية وتشغيل خارطة السير',8,'1 day','business_days','once','{}','high','client_visible','LT-2-08',false,'litigation_secretary'),

    ('litigation-v2','foundation_registration','prepare_timeline','إعداد الجدول الزمني وإرساله للعميل',1,'2 days','business_days','once','{}','high','client_visible','LT-3-01',false,'primary_assignee'),
    ('litigation-v2','foundation_registration','detailed_case_study','الدراسة التفصيلية وبطاقة القضية',2,'2 days','business_days','once','{"executive_approval":"conditional_medium_or_major"}','high','internal','LT-3-02',true,'primary_assignee'),
    ('litigation-v2','foundation_registration','file_claim','إعداد ورفع صحيفة الدعوى وإرسال تقرير العميل',3,'5 days','business_days','once','{}','critical','client_visible','LT-3-03',false,'primary_assignee'),
    ('litigation-v2','foundation_registration','handle_filing_delay','معالجة تأخر التدقيق أو التقديم عبر مركز ناجز',4,'5 days','business_days','event','{}','critical','internal','LT-3-04',false,'primary_assignee'),

    ('litigation-v2','first_instance','record_hearing','تسجيل موعد الجلسة خلال يوم من التبليغ',1,'1 day','business_days','event','{}','critical','client_visible','LT-4-01',false,'primary_assignee'),
    ('litigation-v2','first_instance','prepare_hearing_form','إعداد وتوقيع نموذج التحضير قبل الجلسة بأسبوع',2,'7 days','calendar_days','event','{"offset_before_event_days":7}','critical','internal','LT-4-02',true,'primary_assignee'),
    ('litigation-v2','first_instance','prepare_briefs','إعداد اللوائح خلال ثلث المدة المتبقية',3,'0 days','legal_date','legal_deadline','{"fraction_of_remaining_time":0.333333}','critical','internal','LT-4-03',true,'primary_assignee'),
    ('litigation-v2','first_instance','send_hearing_report','إرسال تقرير العميل المعتمد في نفس يوم الجلسة',4,'0 days','legal_date','event','{"same_day":true,"before_local_time":"14:00"}','critical','client_visible','LT-4-04',false,'primary_assignee'),
    ('litigation-v2','first_instance','review_minutes_correct','مراجعة ضبط الجلسة ورفع مذكرة تصحيح عند الحاجة',5,'1 day','business_days','event','{}','high','internal','LT-4-05',false,'primary_assignee'),
    ('litigation-v2','first_instance','archive_minutes_next_date','أرشفة الضبط وتسجيل الموعد التالي',6,'1 day','business_days','event','{}','high','internal','LT-4-06',false,'primary_assignee'),
    ('litigation-v2','first_instance','set_next_action_same_day','تحديد الإجراء القادم وتاريخه في نفس يوم الجلسة',7,'0 days','legal_date','event','{"same_day":true,"required_for_active_case":true}','critical','internal','LT-4-07',false,'primary_assignee'),
    ('litigation-v2','first_instance','prepare_evidence_witnesses','متابعة الشهود والبينات والاستجواب قبل الجلسة',8,'7 days','calendar_days','event','{"offset_before_event_days":7}','critical','internal','LT-4-08',false,'primary_assignee'),

    ('litigation-v2','appeal','archive_judgment_documents','حفظ الحكم ومستنداته',1,'1 day','business_days','event','{}','high','internal','LT-5-01',false,'primary_assignee'),
    ('litigation-v2','appeal','delayed_judgment_ticket','إنشاء تذكرة عند تأخر صك الحكم',2,'5 days','business_days','event','{"after_event_business_days":5}','high','internal','LT-5-02',false,'litigation_secretary'),
    ('litigation-v2','appeal','create_objection_task','إنشاء مهمة الاعتراض في نفس يوم الحكم',3,'0 days','legal_date','event','{"same_day":true}','critical','internal','LT-5-03',false,'primary_assignee'),
    ('litigation-v2','appeal','draft_appeal','إعداد لائحة الاستئناف',4,'15 days','legal_date','legal_deadline','{"maximum_days":15,"fraction_of_legal_deadline":0.5}','critical','internal','LT-5-04',false,'primary_assignee'),
    ('litigation-v2','appeal','review_file_appeal','مراجعة لائحة الاستئناف وتقديمها',5,'0 days','legal_date','legal_deadline','{}','critical','internal','LT-5-05',false,'primary_assignee'),
    ('litigation-v2','appeal','prepare_appeal_hearing','تحضير جلسات الاستئناف',6,'7 days','calendar_days','event','{"offset_before_event_days":7}','critical','internal','LT-5-06',false,'primary_assignee'),
    ('litigation-v2','appeal','next_action_without_hearing','إنشاء الإجراء القادم عند عدم وجود جلسة',7,'5 days','business_days','event','{"required_for_active_case":true}','critical','internal','LT-5-07',false,'primary_assignee'),
    ('litigation-v2','appeal','follow_final_judgment','متابعة الحكم النهائي والصيغة التنفيذية والتصحيحات',8,'5 days','business_days','recurring','{"frequency":"business_days","interval":5}','high','internal','LT-5-08',false,'primary_assignee'),
    ('litigation-v2','appeal','cassation_or_review','إعداد ومراجعة وتعديل ورفع النقض أو الالتماس',9,'20 days','legal_date','legal_deadline','{"draft_days":15,"review_days":2,"revision_days":2,"file_by_day":20}','critical','internal','LT-5-09',false,'primary_assignee'),
    ('litigation-v2','appeal','check_opponent_appeal','فحص لائحة الخصم كل خمسة أيام عمل',10,'5 days','business_days','recurring','{"frequency":"business_days","interval":5}','high','internal','LT-5-10',false,'primary_assignee'),
    ('litigation-v2','appeal','respond_to_opponent','إعداد الرد والتحضير لجلسة الاعتراض',11,'7 days','business_days','event','{}','critical','internal','LT-5-11',false,'primary_assignee'),

    ('litigation-v2','enforcement','open_enforcement_request','فتح طلب التنفيذ',1,'2 days','business_days','event','{}','critical','internal','LT-6-01',false,'primary_assignee'),
    ('litigation-v2','enforcement','verify_executory_wording','التحقق من الصيغة التنفيذية',2,'0 days','legal_date','event','{"same_day":true}','critical','internal','LT-6-02',false,'primary_assignee'),
    ('litigation-v2','enforcement','submit_enforcement','تقديم طلب التنفيذ وتوثيق النتيجة',3,'0 days','legal_date','event','{"same_day":true}','critical','internal','LT-6-03',false,'primary_assignee'),
    ('litigation-v2','enforcement','follow_enforcement','متابعة التنفيذ ورفع الإجراء التالي',4,'7 days','business_days','recurring','{"frequency":"business_days","interval":7,"requires_next_action":true}','high','internal','LT-6-04',false,'primary_assignee'),

    ('litigation-v2','closing_collection','prepare_final_invoice','إعداد الفاتورة ووجه الاستحقاق',1,'3 days','business_days','event','{}','high','internal','LT-7-01',false,'accountant'),
    ('litigation-v2','closing_collection','weekly_collection','متابعة التحصيل أسبوعيًا',2,'7 days','calendar_days','recurring','{"frequency":"weekly","interval":1}','high','internal','LT-7-02',false,'accountant'),
    ('litigation-v2','closing_collection','escalate_after_30_days','رفع توصية التصعيد بعد عدم السداد',3,'30 days','calendar_days','event','{"to":"executive_manager"}','critical','internal','LT-7-03',false,'litigation_manager'),
    ('litigation-v2','closing_collection','comprehensive_report','إعداد التقرير الشامل وحصر الأعمال',4,'3 days','business_days','event','{}','high','client_visible','LT-7-04',false,'primary_assignee'),
    ('litigation-v2','closing_collection','closing_letter_release_invoice','إرسال الخطاب الختامي والمخالصة والفاتورة النهائية',5,'10 days','business_days','once','{}','high','client_visible','LT-7-05',false,'litigation_secretary')
)
insert into public.workflow_action_templates (
  workflow_stage_template_id, code, name, position, planned_duration,
  duration_start_rule, is_required, visibility, completion_dsl, priority,
  schedule_type, duration_basis, recurrence_rule, source_reference,
  needs_operational_confirmation
)
select stage.id, action.code, action.name, action.position,
  action.duration_text::interval,
  case when action.executor_kind in ('eligible_study_assignee','primary_assignee') then 'when_assigned' else 'when_ready' end,
  true, action.visibility,
  jsonb_build_object('executor_kind', action.executor_kind),
  action.priority, action.schedule_type, action.duration_basis,
  action.recurrence_rule::jsonb, action.source_reference, action.noc
from action_data action
join public.workflow_templates template on template.slug = action.template_slug
join public.workflow_template_versions version
  on version.workflow_template_id = template.id and version.version_number = 2
join public.workflow_stage_templates stage
  on stage.workflow_template_version_id = version.id and stage.code = action.stage_code
on conflict (workflow_stage_template_id, code) do nothing;

-- Estate root stages.
with stage_data(code, name, position, target_duration, maximum_duration, stage_mode, close_rule, optional, noc) as (
  values
    ('preliminary','المرحلة التمهيدية',1,'5 days',null,'sequential','required_actions',false,true),
    ('inventory','الحصر والاستعلام',2,null,'60 days','parallel','manual_approval',false,false),
    ('preparation','التهيئة',3,'60 days',null,'parallel','required_actions',false,false),
    ('guardianship','الحراسة',4,null,null,'continuous','continuous',true,false),
    ('estate_litigation','التقاضي عند الحاجة',5,null,null,'optional','manual_approval',true,true),
    ('liquidation','التصفية',6,'90 days',null,'parallel','manual_approval',true,false),
    ('marketing','التسويق',7,'90 days',null,'parallel','manual_approval',true,false),
    ('periodic_reports','التقارير الدورية',8,'15 days',null,'continuous','continuous',false,false),
    ('isnad_conditions','تركات مركز الإسناد',9,null,null,'conditional','manual_approval',true,false)
)
insert into public.workflow_stage_templates (
  workflow_template_version_id, code, name, position, target_duration,
  maximum_duration, is_optional, close_rule, stage_mode, source_reference,
  needs_operational_confirmation
)
select version.id, stage.code, stage.name, stage.position,
  stage.target_duration::interval, stage.maximum_duration::interval,
  stage.optional, stage.close_rule, stage.stage_mode,
  'خارطة التركات/' || stage.code, stage.noc
from stage_data stage
join public.workflow_templates template on template.slug = 'estate-v2'
join public.workflow_template_versions version
  on version.workflow_template_id = template.id and version.version_number = 2
on conflict (workflow_template_version_id, code) do nothing;

with estate_action(
  stage_code, code, name, position, days, basis, schedule_type,
  recurrence, priority, source_ref, noc, team_code
) as (
  values
    ('preliminary','deceased_identity','جمع هوية المتوفى',1,0,'business_days','once','{}','normal','ES-P-01',false,'inventory'),
    ('preliminary','heirs_identities','جمع هويات جميع الورثة',2,0,'business_days','once','{}','normal','ES-P-02',false,'inventory'),
    ('preliminary','death_certificate','جمع شهادة الوفاة',3,0,'business_days','once','{}','normal','ES-P-03',false,'inventory'),
    ('preliminary','heirs_certificate','جمع صك حصر الورثة',4,0,'business_days','once','{}','high','ES-P-04',false,'inventory'),
    ('preliminary','national_addresses','جمع العناوين الوطنية',5,0,'business_days','once','{}','normal','ES-P-05',false,'inventory'),
    ('preliminary','phone_numbers','جمع أرقام التواصل',6,0,'business_days','once','{}','normal','ES-P-06',false,'inventory'),
    ('preliminary','passports','جمع الجوازات للأملاك الأجنبية',7,0,'business_days','event','{}','normal','ES-P-07',false,'inventory'),
    ('preliminary','emails','جمع البريد الإلكتروني للأطراف',8,0,'business_days','once','{}','normal','ES-P-08',false,'inventory'),
    ('preliminary','bank_certificates','جمع شهادة الحساب البنكي لكل وارث',9,0,'business_days','once','{}','high','ES-P-09',false,'finance'),
    ('preliminary','consolidated_heirs_register','إنشاء سجل موحد لبيانات الورثة',10,0,'business_days','once','{}','high','ES-P-10',false,'inventory'),
    ('preliminary','archive_preliminary_documents','أرشفة وفهرسة الحزمة التمهيدية',11,0,'business_days','once','{}','normal','ES-P-11',false,'inventory'),
    ('preliminary','joint_power_of_attorney','إصدار وكالة موحدة',12,5,'business_days','once','{}','high','ES-P-12',true,'inventory'),
    ('preliminary','identify_assets','تحديد جميع الأصول والعناصر',13,5,'business_days','once','{}','high','ES-P-13',true,'inventory'),
    ('preliminary','create_asset_subprojects','إنشاء مشروع فرعي لكل أصل أو قضية',14,5,'business_days','once','{}','high','ES-P-14',true,'inventory'),
    ('preliminary','create_tracking_register','إنشاء سجل متابعة الأصول',15,5,'business_days','once','{}','normal','ES-P-15',true,'inventory'),
    ('preliminary','confirm_document_bundle','اعتماد اكتمال حزمة المستندات',16,5,'business_days','once','{}','critical','ES-P-16',true,'inventory'),

    ('inventory','estate_disclosure','طلب الإفصاح عن التركة',1,5,'business_days','once','{}','high','ES-I-01',false,'inventory'),
    ('inventory','inventory_study_map','دراسة المستندات وإعداد خريطة الحصر',2,5,'business_days','once','{}','high','ES-I-02',false,'inventory'),
    ('inventory','inventory_index','فهرسة مستندات الحصر',3,5,'business_days','once','{}','normal','ES-I-03',false,'inventory'),
    ('inventory','electronic_receipt_statement','إثبات الاستلام والتمثيل الإلكتروني',4,3,'business_days','once','{}','normal','ES-I-04',false,'inventory'),
    ('inventory','property_inquiries','الاستعلام عن العقارات',5,3,'business_days','once','{}','high','ES-I-05',false,'inventory'),
    ('inventory','central_bank_inquiries','الاستعلام عن الحسابات لدى البنك المركزي',6,3,'business_days','once','{}','high','ES-I-06',false,'inventory'),
    ('inventory','capital_market_inquiries','الاستعلام لدى هيئة السوق المالية',7,3,'business_days','once','{}','high','ES-I-07',false,'inventory'),
    ('inventory','vehicle_inquiries','الاستعلام عن المركبات',8,3,'business_days','once','{}','normal','ES-I-08',false,'inventory'),
    ('inventory','commercial_register_inquiries','الاستعلام عن السجلات التجارية',9,3,'business_days','once','{}','normal','ES-I-09',false,'inventory'),
    ('inventory','title_deed_inquiries','الاستعلام عن الصكوك والبورصة العقارية',10,3,'business_days','once','{}','high','ES-I-10',false,'inventory'),
    ('inventory','case_inquiries','الاستعلام عن القضايا',11,0,'business_days','once','{}','high','ES-I-11',true,'litigation'),
    ('inventory','contribution_inquiries','الاستعلام عن المساهمات',12,0,'business_days','once','{}','normal','ES-I-12',true,'inventory'),
    ('inventory','liability_notice','إعلان إبراء الذمة واستقبال المطالبات',13,30,'calendar_days','event','{}','high','ES-I-13',false,'inventory'),
    ('inventory','tax_fee_inquiries','الاستعلام عن الضرائب والرسوم',14,3,'business_days','once','{}','normal','ES-I-14',false,'finance'),
    ('inventory','lease_inquiries','الاستعلام عن عقود الإيجار وإيجار',15,3,'business_days','once','{}','normal','ES-I-15',false,'inventory'),
    ('inventory','movable_asset_inquiries','الاستعلام عن المنقولات والنقد والديون',16,3,'business_days','once','{}','normal','ES-I-16',false,'inventory'),
    ('inventory','analyze_inventory_responses','تحليل الردود وتحديث خريطة كل أصل',17,0,'business_days','once','{}','high','ES-I-17',true,'inventory'),
    ('inventory','inventory_report','إعداد واعتماد تقرير الحصر',18,5,'business_days','once','{}','high','ES-I-18',false,'inventory'),

    ('preparation','open_estate_bank_account','فتح حساب التركة',1,10,'business_days','once','{}','high','ES-R-01',false,'finance'),
    ('preparation','asset_ledgers','إنشاء دفاتر مالية لكل أصل',2,5,'business_days','once','{}','normal','ES-R-02',false,'finance'),
    ('preparation','heir_ledgers','إنشاء دفاتر مالية لكل وارث',3,3,'business_days','once','{}','normal','ES-R-03',false,'finance'),
    ('preparation','project_ledger','إنشاء المركز المالي للمشروع',4,10,'business_days','once','{}','high','ES-R-04',false,'finance'),
    ('preparation','operating_reserve','تحديد احتياطي التشغيل',5,0,'business_days','once','{}','high','ES-R-05',true,'finance'),
    ('preparation','update_deeds','تحديث الصكوك',6,5,'business_days','once','{}','normal','ES-R-06',false,'preparation'),
    ('preparation','engineering_contract','التعاقد الهندسي',7,5,'business_days','once','{}','normal','ES-R-07',false,'preparation'),
    ('preparation','bank_transfers','تنفيذ التحويلات البنكية اللازمة',8,14,'business_days','once','{}','high','ES-R-08',false,'finance'),
    ('preparation','asset_inspections','معاينة الأصول',9,20,'business_days','once','{}','normal','ES-R-09',false,'preparation'),
    ('preparation','prepare_vehicles','تهيئة المركبات',10,10,'business_days','once','{}','normal','ES-R-10',false,'preparation'),
    ('preparation','prepare_portfolios','تهيئة المحافظ الاستثمارية',11,15,'business_days','once','{}','normal','ES-R-11',false,'preparation'),
    ('preparation','two_valuers','الحصول على تقييمين من شركتين',12,15,'business_days','once','{}','high','ES-R-12',false,'preparation'),
    ('preparation','minor_sale_approval','الحصول على موافقة بيع مال القاصر',13,15,'business_days','event','{}','critical','ES-R-13',false,'preparation'),
    ('preparation','land_planning','تخطيط وفرز الأراضي عند الحاجة',14,10,'business_days','event','{}','normal','ES-R-14',false,'preparation'),
    ('preparation','asset_readiness_approval','اعتماد جاهزية الأصل',15,0,'business_days','once','{}','high','ES-R-15',true,'preparation'),

    ('guardianship','guard_inspection','معاينة أصل الحراسة',1,20,'business_days','once','{}','normal','ES-G-01',false,'guardianship'),
    ('guardianship','security_services','توفير الحراسة والأمن',2,10,'business_days','once','{}','high','ES-G-02',false,'guardianship'),
    ('guardianship','operating_permits','استخراج التصاريح',3,30,'business_days','once','{}','normal','ES-G-03',false,'guardianship'),
    ('guardianship','maintenance','تنفيذ الصيانة',4,10,'business_days','event','{}','normal','ES-G-04',false,'guardianship'),
    ('guardianship','leases_ejar','إدارة العقود ومنصة إيجار',5,30,'business_days','recurring','{"frequency":"monthly"}','normal','ES-G-05',false,'guardianship'),
    ('guardianship','unit_ledgers','إنشاء دفاتر الوحدات',6,0,'business_days','once','{}','normal','ES-G-06',true,'finance'),
    ('guardianship','rent_collection','تحصيل الإيجارات',7,30,'calendar_days','recurring','{"frequency":"monthly"}','high','ES-G-07',false,'finance'),
    ('guardianship','monthly_guard_report','إعداد تقرير الحراسة الشهري',8,30,'calendar_days','recurring','{"frequency":"monthly"}','normal','ES-G-08',false,'guardianship'),
    ('guardianship','vat','معالجة ضريبة القيمة المضافة',9,3,'business_days','event','{}','high','ES-G-09',false,'finance'),
    ('guardianship','white_land_fee','معالجة رسوم الأراضي البيضاء',10,5,'business_days','event','{}','high','ES-G-10',false,'finance'),
    ('guardianship','delinquent_enforcement','تنفيذ المتأخرات',11,5,'business_days','event','{}','high','ES-G-11',false,'litigation'),
    ('guardianship','payroll','إدارة الرواتب',12,30,'calendar_days','recurring','{"frequency":"monthly"}','normal','ES-G-12',false,'finance'),
    ('guardianship','equipment_wells','متابعة المعدات والآبار',13,30,'calendar_days','recurring','{"frequency":"monthly"}','normal','ES-G-13',false,'guardianship'),
    ('guardianship','well_permits','تصاريح الآبار',14,5,'business_days','event','{}','normal','ES-G-14',false,'guardianship'),
    ('guardianship','utility_ledgers','إنشاء دفاتر الخدمات',15,10,'business_days','once','{}','normal','ES-G-15',false,'finance'),
    ('guardianship','estate_debt_claim','المطالبة بديون التركة وإحالتها للتقاضي',16,15,'business_days','event','{}','critical','ES-G-16',true,'litigation'),

    ('estate_litigation','refer_estate_litigation','إنشاء مشروع تقاضي تركة مستقل وإحالته لإدارة التقاضي',1,0,'business_days','event','{}','critical','ES-LT-01',true,'litigation'),

    ('liquidation','calculate_heir_shares','احتساب أنصبة الورثة',1,10,'business_days','once','{}','critical','ES-L-01',false,'liquidation'),
    ('liquidation','real_estate_valuation','تقييم العقارات',2,10,'business_days','once','{}','high','ES-L-02',false,'liquidation'),
    ('liquidation','movable_valuation','تقييم المنقولات',3,10,'business_days','once','{}','high','ES-L-03',false,'liquidation'),
    ('liquidation','liquidate_bank_accounts','تصفية الحسابات البنكية',4,15,'business_days','once','{}','high','ES-L-04',false,'finance'),
    ('liquidation','liquidate_portfolios','تصفية المحافظ الاستثمارية',5,15,'business_days','once','{}','high','ES-L-05',false,'finance'),
    ('liquidation','consensual_division','تنفيذ القسمة الرضائية',6,45,'calendar_days','once','{}','critical','ES-L-06',false,'liquidation'),
    ('liquidation','debt_reserve','حجز احتياطي الديون',7,3,'business_days','once','{}','high','ES-L-07',false,'finance'),
    ('liquidation','transfer_deeds','نقل الصكوك',8,3,'business_days','event','{}','high','ES-L-08',false,'liquidation'),
    ('liquidation','transfer_heir_entitlements','تحويل مستحقات الورثة',9,15,'calendar_days','event','{"wait_after_receipt_days":10,"execute_within_days":5}','critical','ES-L-09',false,'finance'),
    ('liquidation','execute_wills','تنفيذ الوصايا',10,3,'business_days','once','{}','high','ES-L-10',false,'liquidation'),
    ('liquidation','minor_procedures','إجراءات أموال القصر',11,5,'business_days','event','{}','critical','ES-L-11',false,'liquidation'),
    ('liquidation','heir_releases','استلام المخالصات',12,5,'business_days','once','{}','high','ES-L-12',false,'liquidation'),
    ('liquidation','internal_auction','تنفيذ المزاد الداخلي',13,15,'business_days','event','{}','high','ES-L-13',true,'liquidation'),

    ('marketing','advertising_permit','استخراج تصريح الإعلان',1,5,'business_days','once','{}','normal','ES-M-01',false,'marketing'),
    ('marketing','marketing_sign','إعداد وتركيب لوحة التسويق',2,10,'business_days','once','{}','normal','ES-M-02',false,'marketing'),
    ('marketing','marketing_brochure','إعداد الكتيب التسويقي',3,10,'business_days','once','{}','normal','ES-M-03',false,'marketing'),
    ('marketing','marketing_video','إعداد الفيديو التسويقي',4,10,'business_days','once','{}','normal','ES-M-04',false,'marketing'),
    ('marketing','three_marketing_companies','إسناد التسويق إلى ثلاث جهات',5,60,'calendar_days','once','{}','high','ES-M-05',false,'marketing'),
    ('marketing','auction_company','التعاقد مع شركة مزاد',6,10,'business_days','event','{}','high','ES-M-06',false,'marketing'),

    ('periodic_reports','generate_quarterly_report','إنشاء التقرير الموضوعي والإجرائي والمالي من بيانات النظام',1,15,'business_days','recurring','{"frequency":"days","interval":90,"prepare_within_business_days":15}','high','ES-Q-01',false,'reporting'),
    ('periodic_reports','add_human_notes','إضافة الملاحظات البشرية للتقرير',2,15,'business_days','event','{}','normal','ES-Q-02',false,'reporting'),
    ('periodic_reports','review_approve_report','مراجعة واعتماد إصدار التقرير',3,15,'business_days','event','{}','high','ES-Q-03',false,'reporting'),
    ('periodic_reports','publish_report','نشر النسخة المعتمدة للعميل',4,15,'business_days','event','{}','high','ES-Q-04',false,'reporting'),

    ('isnad_conditions','study_isnad_judgment','دراسة حكم مركز الإسناد',1,0,'business_days','event','{}','critical','ES-S-01',false,'inventory'),
    ('isnad_conditions','register_isnad_references','تسجيل الحكم والعقد ودليل المصفي كمراجع',2,0,'business_days','event','{}','high','ES-S-02',false,'inventory'),
    ('isnad_conditions','record_isnad_correspondence','تسجيل مراسلات مركز الإسناد',3,0,'business_days','recurring','{"frequency":"event"}','normal','ES-S-03',false,'inventory'),
    ('isnad_conditions','isnad_liquidation_marketing','تنفيذ التصفية والتسويق وفق آلية مركز الإسناد',4,90,'calendar_days','event','{}','critical','ES-S-04',false,'liquidation')
)
insert into public.workflow_action_templates (
  workflow_stage_template_id, code, name, position, planned_duration,
  duration_start_rule, is_required, visibility, completion_dsl, priority,
  schedule_type, duration_basis, recurrence_rule, source_reference,
  needs_operational_confirmation
)
select stage.id, action.code, action.name, action.position,
  make_interval(days => action.days), 'when_assigned', true, 'internal',
  jsonb_build_object('project_team_code', action.team_code),
  action.priority, action.schedule_type, action.basis,
  action.recurrence::jsonb, action.source_ref, action.noc
from estate_action action
join public.workflow_templates template on template.slug = 'estate-v2'
join public.workflow_template_versions version
  on version.workflow_template_id = template.id and version.version_number = 2
join public.workflow_stage_templates stage
  on stage.workflow_template_version_id = version.id and stage.code = action.stage_code
on conflict (workflow_stage_template_id, code) do nothing;

-- The child asset template copies all source actions that can run independently per asset.
with asset_stage(code, name, position, target_duration, stage_mode, close_rule, optional) as (
  values
    ('preparation','تهيئة الأصل',1,'60 days','parallel','required_actions',false),
    ('guardianship','حراسة الأصل',2,null,'continuous','continuous',true),
    ('estate_litigation','تقاضي الأصل',3,null,'optional','manual_approval',true),
    ('liquidation','تصفية الأصل',4,'90 days','parallel','manual_approval',true),
    ('marketing','تسويق الأصل',5,'90 days','parallel','manual_approval',true)
)
insert into public.workflow_stage_templates (
  workflow_template_version_id, code, name, position, target_duration,
  is_optional, close_rule, stage_mode, source_reference
)
select asset_version.id, stage.code, stage.name, stage.position,
  stage.target_duration::interval, stage.optional, stage.close_rule,
  stage.stage_mode, 'خارطة التركات/مشروع الأصل/' || stage.code
from asset_stage stage
join public.workflow_templates asset_template on asset_template.slug = 'estate-asset-v2'
join public.workflow_template_versions asset_version
  on asset_version.workflow_template_id = asset_template.id and asset_version.version_number = 2
on conflict (workflow_template_version_id, code) do nothing;

insert into public.workflow_action_templates (
  workflow_stage_template_id, code, name, position, planned_duration,
  duration_start_rule, is_required, visibility, completion_dsl, priority,
  schedule_type, duration_basis, recurrence_rule, event_trigger_code,
  source_reference, needs_operational_confirmation
)
select asset_stage.id, root_action.code, root_action.name, root_action.position,
  root_action.planned_duration, root_action.duration_start_rule,
  root_action.is_required, root_action.visibility, root_action.completion_dsl,
  root_action.priority, root_action.schedule_type, root_action.duration_basis,
  root_action.recurrence_rule, root_action.event_trigger_code,
  root_action.source_reference, root_action.needs_operational_confirmation
from public.workflow_templates root_template
join public.workflow_template_versions root_version
  on root_version.workflow_template_id = root_template.id and root_version.version_number = 2
join public.workflow_stage_templates root_stage
  on root_stage.workflow_template_version_id = root_version.id
join public.workflow_action_templates root_action
  on root_action.workflow_stage_template_id = root_stage.id
join public.workflow_templates asset_template
  on asset_template.organization_id = root_template.organization_id
 and asset_template.slug = 'estate-asset-v2'
join public.workflow_template_versions asset_version
  on asset_version.workflow_template_id = asset_template.id and asset_version.version_number = 2
join public.workflow_stage_templates asset_stage
  on asset_stage.workflow_template_version_id = asset_version.id
 and asset_stage.code = root_stage.code
where root_template.slug = 'estate-v2'
  and root_stage.code in ('preparation','guardianship','estate_litigation','liquidation','marketing')
on conflict (workflow_stage_template_id, code) do nothing;

-- Four participant rules for every v2 action. Rules resolve to project membership
-- or project teams at runtime; templates never store concrete users.
insert into public.workflow_action_assignment_rules (
  workflow_action_template_id, participant_type, selector_type,
  project_membership_role, project_team_code, allowed_role_ids,
  minimum_participants, maximum_participants, allow_self_assignment,
  priority, selector_config
)
select action.id, participant.participant_type,
  case
    when participant.participant_type = 'executor'
      and template.workflow_type in ('estate','estate_asset')
    then 'project_team'
    else 'project_membership'
  end,
  case
    when participant.participant_type = 'responsible' then 'department_manager'
    when participant.participant_type = 'executor' then 'executor'
    when participant.participant_type = 'follower' then 'follower'
    else 'approver'
  end,
  case
    when participant.participant_type = 'executor'
      and template.workflow_type in ('estate','estate_asset')
    then coalesce(action.completion_dsl ->> 'project_team_code', 'estate_operations')
    else null
  end,
  case
    when participant.participant_type = 'executor'
      and template.workflow_type = 'pre_contract'
    then array(
      select role.id from public.roles role
      where role.organization_id = template.organization_id
        and role.code in (
          'lawyer','legal_specialist','litigation_secretary',
          'litigation_manager','estates_secretary','estates_manager'
        )
    )
    else '{}'::uuid[]
  end,
  1,
  case
    when participant.participant_type = 'executor'
      and template.workflow_type in ('estate','estate_asset')
    then 20
    else 1
  end,
  false,
  100,
  jsonb_build_object(
    'source_aligned', true,
    'participant_default', participant.participant_type
  )
from public.workflow_templates template
join public.workflow_template_versions version
  on version.workflow_template_id = template.id and version.version_number = 2
join public.workflow_stage_templates stage
  on stage.workflow_template_version_id = version.id
join public.workflow_action_templates action
  on action.workflow_stage_template_id = stage.id
cross join (
  values ('responsible'), ('executor'), ('follower'), ('approver')
) as participant(participant_type)
where template.slug in ('pre-contract-v2','litigation-v2','estate-v2','estate-asset-v2')
on conflict (workflow_action_template_id, participant_type, priority) do nothing;

-- Explicit dependencies only where the source requires sequencing. Other actions
-- remain parallel and are governed by stage closure rules.
insert into public.workflow_action_dependencies (
  action_template_id, depends_on_action_template_id, dependency_type
)
select current_action.id, previous_action.id, 'finish_to_start'
from public.workflow_templates template
join public.workflow_template_versions version
  on version.workflow_template_id = template.id and version.version_number = 2
join public.workflow_stage_templates stage
  on stage.workflow_template_version_id = version.id
join public.workflow_action_templates current_action
  on current_action.workflow_stage_template_id = stage.id
join public.workflow_action_templates previous_action
  on previous_action.workflow_stage_template_id = stage.id
 and previous_action.position = current_action.position - 1
where template.slug in ('pre-contract-v2','litigation-v2')
  and stage.code not in ('first_instance','appeal','enforcement')
on conflict do nothing;
