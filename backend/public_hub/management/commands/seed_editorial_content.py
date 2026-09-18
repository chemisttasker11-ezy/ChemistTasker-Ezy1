from datetime import timedelta
import os
import shutil
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone
from public_hub.models import Article, Comment, Reaction


class Command(BaseCommand):
    help = 'Seed realistic, high-quality News and Learning editorial articles with variety under each class and generated photos.'

    def handle(self, *args, **options):
        User = get_user_model()

        # 1. Image management & sync
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
        landing_img_dir = os.path.join(project_root, 'frontend_web', 'landing_next', 'public', 'images', 'editorial')
        backend_media_dir = os.path.join(project_root, 'backend', 'media', 'editorial')

        os.makedirs(landing_img_dir, exist_ok=True)
        os.makedirs(backend_media_dir, exist_ok=True)

        image_mappings = {
            'tga_regulatory_update_1789689716328.jpg': 'tga_regulatory_update.jpg',
            'scope_of_practice_1789689753745.jpg': 'scope_of_practice.jpg',
            'dispensary_auditing_1789689796380.jpg': 'dispensary_auditing.jpg',
            'regional_pharmacy_community_1789689842322.jpg': 'regional_pharmacy_community.jpg',
            'paediatric_dosing_calc_1789689893135.jpg': 'paediatric_dosing_calc.jpg',
            'board_exam_prep_1789689948218.jpg': 'board_exam_prep.jpg',
            's8_cold_chain_protocols_1789690006643.jpg': 's8_cold_chain_protocols.jpg',
            'dispensary_tech_training_1789690067850.jpg': 'dispensary_tech_training.jpg',
        }

        if os.path.exists(brain_dir):
            for src_name, dest_name in image_mappings.items():
                src_path = os.path.join(brain_dir, src_name)
                if os.path.exists(src_path):
                    for target_dir in (landing_img_dir, backend_media_dir):
                        dest_path = os.path.join(target_dir, dest_name)
                        shutil.copy2(src_path, dest_path)
            self.stdout.write(self.style.SUCCESS("Editorial images confirmed in landing_next public and backend media directories."))

        # 2. Match authors to existing local users
        def get_user_by_email(email):
            return User.objects.filter(email__iexact=email).first()

        fallback_user = User.objects.first()
        u_salah = get_user_by_email('doc.m.salah@gmail.com') or fallback_user
        u_abas = get_user_by_email('eslam.abas.ph@gmail.com') or fallback_user
        u_admin = get_user_by_email('admin@priceline.com') or fallback_user
        u_ramadan = get_user_by_email('ahmed.ramadan.ph@gmail.com') or fallback_user
        u_basma = get_user_by_email('basma.soliman.a@gmail.com') or fallback_user
        u_exp = get_user_by_email('exp@gmail.com') or fallback_user
        u_zaheer = get_user_by_email('chemisttasker4@gmail.com') or fallback_user
        u_mia = get_user_by_email('mia.brennan54@gmail.com') or fallback_user

        now = timezone.now()

        articles_data = [
            # ==========================================
            # NEWS ARTICLES (kind='news')
            # ==========================================
            {
                'slug': 'tga-mandatory-shortage-reporting-sssn-2026',
                'title': 'TGA 2026 Reforms: Mandatory Real-Time Shortage Reporting & Serious Shortage Substitution Notices',
                'kind': 'news',
                'topic': 'tga',
                'author_user': u_salah,
                'author_name': 'Dr. M. Salah, Consultant Pharmacist & Preceptor',
                'cover_url': 'http://localhost:3000/images/editorial/tga_regulatory_update.jpg',
                'cover_alt': 'Australian Therapeutic Goods Administration regulatory updates binder and clinical reference desk',
                'source_name': 'Therapeutic Goods Administration (TGA) Regulatory Notice',
                'source_url': 'https://www.tga.gov.au/safety/shortages',
                'featured': True,
                'published_at': now - timedelta(hours=6),
                'excerpt': 'A practical clinical breakdown of updated Therapeutic Goods Act section 30EA rules, mandatory notification thresholds for critical medicines, and how community dispensers execute SSSN substitution legally at the bench.',
                'seo_title': 'TGA 2026 Shortage Reporting & SSSN Dispensing',
                'seo_description': 'Key TGA regulatory amendments on mandatory medicine shortage notifications and SSSN substitution guidelines for Australian community pharmacists.',
                'body': (
                    "The Therapeutic Goods Administration (TGA) has introduced strengthened compliance enforcement under section 30EA of the Therapeutic Goods Act 1989, compelling medicine sponsors to notify critical medicine shortages in real time.\n\n"
                    "## New Mandatory Notification Thresholds for Medicine Sponsors\n\n"
                    "Under the enhanced regulatory framework, sponsors of medicines categorized as having 'critical patient impact'—including broad-spectrum paediatric antibiotics, anticonvulsants, and anti-arrhythmics—must report anticipated supply disruptions within 48 hours of identification. Penalties for non-compliance now align with civil penalty provisions, aimed at eliminating the information vacuum that has historically plagued frontline community pharmacies.\n\n"
                    "## Serious Shortage Substitution Notices (SSSN) in Daily Practice\n\n"
                    "When the TGA issues a Serious Shortage Substitution Notice (SSSN), community pharmacists are empowered under state legislation to substitute a specific medicine without prior approval from the prescriber, provided statutory replacement parameters are strictly met:\n\n"
                    "1. The substituted medicine must be an exact bioequivalent or therapeutically equivalent agent approved explicitly under the SSSN schedule.\n"
                    "2. The total dose dispensed must not exceed the prescribed duration of therapy.\n"
                    "3. The patient or carer must be fully informed, give informed consent, and receive appropriate counseling regarding strength or dosage form changes.\n"
                    "4. Prescribers must be formally notified in writing (via secure messaging or direct clinical handover) within the mandated notification window.\n\n"
                    "## Practical Verification Checklist for Dispensing Pharmacists\n\n"
                    "Before dispensing under an SSSN, ensure your dispensary workflow incorporates:\n\n"
                    "- Verification that the original prescription is current and has not already had repeats fully exhausted.\n"
                    "- Direct confirmation against the active TGA SSSN database that the specific strength and formulation are within the effective dates.\n"
                    "- Annotation on both the physical/electronic prescription record and the pharmacy dispensing software audit log referencing the exact SSSN gazette number.\n"
                    "- Provision of a printed Consumer Medicine Information (CMI) leaflet whenever the substituted brand exhibits unfamiliar excipients or altered tablet markings.\n\n"
                    "## Collaborative Patient Communication at the Counter\n\n"
                    "Frontline dispensary staff and locums should proactively address patient anxiety regarding brand or formulation swaps. Explaining that the substitution is authorized under national health emergency protocols—and that the active chemical entity and safety profile remain identical—builds adherence and reinforces trust in the community pharmacy profession."
                ),
            },
            {
                'slug': 'expanding-scope-pharmacist-prescribing-protocols-australia',
                'title': 'Expanding Scope: Pharmacist Prescribing Protocols & Structured Consultation Workflows',
                'kind': 'news',
                'topic': 'practice',
                'author_user': u_abas,
                'author_name': 'Eslam Abas, Senior Clinical Pharmacist',
                'cover_url': 'http://localhost:3000/images/editorial/scope_of_practice.jpg',
                'cover_alt': 'Community pharmacist conducting a private clinical patient consultation in an accredited pharmacy consult room',
                'source_name': 'Pharmacy Board of Australia Practice Guidelines',
                'source_url': 'https://www.pharmacyboard.gov.au/Codes-Guidelines.aspx',
                'featured': False,
                'published_at': now - timedelta(days=1, hours=4),
                'excerpt': 'Autonomous prescribing pilots across Queensland, New South Wales, and Victoria are entering permanent legislation. Here is how leading pharmacies setup consult rooms, red-flag triage, and electronic clinical records.',
                'seo_title': 'Pharmacist Prescribing Protocols Guide',
                'seo_description': 'Essential guidance on pharmacist-initiated prescribing, clinical governance, consult room readiness, and interprofessional handover across Australian states.',
                'body': (
                    "The transition from trial pilots to permanent legislative scope of practice is rapidly transforming Australian community pharmacy. Pharmacist-initiated prescribing protocols are now established for acute conditions such as uncomplicated urinary tract infections (UTIs), hormonal contraception resupply, dermatological conditions (shingles and mild plaque psoriasis), and travel health.\n\n"
                    "## National Scope Harmonisation Across States\n\n"
                    "While Queensland pioneered the initial pilot, Victoria, New South Wales, and Western Australia have rolled out aligned clinical frameworks. Key regulatory bodies, including AHPRA and the Pharmacy Board of Australia, emphasize that expanded scope is not merely an extended dispensing task; it requires robust diagnostic triage, differential diagnosis documentation, and ethical separation of prescribing and dispensing fees.\n\n"
                    "## Consultation Room Setup & Clinical Documentation Standards\n\n"
                    "To maintain clinical accreditation and patient safety, accredited consultation areas must satisfy strict criteria:\n\n"
                    "- Complete visual and acoustic privacy preventing overheard clinical discussions.\n"
                    "- Calibrated diagnostic equipment including digital sphygmomanometers, automated temperature monitors, and access to point-of-care testing supplies.\n"
                    "- Seamless digital integration with the National My Health Record system and secure electronic clinical notes (via GuildCare NG, MedView, or StrongRoom).\n"
                    "- Real-time clinical decision support access to Australian Medicines Handbook (AMH) and Therapeutic Guidelines (eTG).\n\n"
                    "## Red-Flag Clinical Exclusion Criteria\n\n"
                    "Every protocol mandates immediate clinical referral when red flags appear. In UTI consultations, for instance, presence of flank pain, fever >38°C, haematuria, pregnancy, or recurrent episodes (>3 per annum) immediately disqualifies autonomous prescribing and triggers mandatory medical practitioner referral.\n\n"
                    "## Building Trust with Local General Practice Networks\n\n"
                    "Collaborative interprofessional care is the cornerstone of sustainable scope expansion. Leading community pharmacies have established routine bi-directional communication with adjacent general practices, transmitting structured clinical summaries within 24 hours of consultation and maintaining open channels for complex patient case reviews."
                ),
            },
            {
                'slug': '8cpa-midterm-implementation-pbs-digital-claiming-audit',
                'title': '8CPA Implementation & PBS Digital Claiming Auditing Benchmarks',
                'kind': 'news',
                'topic': 'industry',
                'author_user': u_admin,
                'author_name': 'Sarah Jenkins, Managing Partner',
                'cover_url': 'http://localhost:3000/images/editorial/dispensary_auditing.jpg',
                'cover_alt': 'Dispensary barcode scanner, computer terminal, and PBS script audit trail verification',
                'source_name': 'Department of Health and Aged Care (PBS)',
                'source_url': 'https://www.pbs.gov.au/info/general/8cpa-announcements',
                'featured': False,
                'published_at': now - timedelta(days=2, hours=8),
                'excerpt': 'Services Australia and the Department of Health have stepped up automated verification for PBS script online claiming. What dispensary managers and locums must audit every evening to prevent clawbacks.',
                'seo_title': '8CPA Claiming Standards & PBS Dispensary Audit',
                'seo_description': 'How community pharmacy operators and locums can navigate 8CPA funding streams, online PBS claiming validations, and daily reconciliation audits.',
                'body': (
                    "As the 8th Community Pharmacy Agreement (8CPA) approaches its mid-term operational benchmarks, Services Australia has upgraded automated data-matching routines across the PBS Online claiming portal. Ensuring stringent audit compliance has become a primary operational priority for dispensary managers and locum pharmacists alike.\n\n"
                    "## Transition Milestones Under the 8th Community Pharmacy Agreement\n\n"
                    "The 8CPA introduced substantial indexation increases to the Administration, Handling and Infrastructure (AHI) fee and established the Community Pharmacy Programs (CPP) funding envelope. In return, the Department of Health has tied service fee disbursements to verified clinical documentation and digital claim integrity.\n\n"
                    "## PBS Online Claiming Real-Time Reconciliation Rules\n\n"
                    "Key reconciliation rules enforced during daily claiming cycles include:\n\n"
                    "- Verification of prescriber provider numbers against active registration records at the date of prescribing.\n"
                    "- Exact quantity and repeat reconciliation matching the PBS Schedule restrictions for the specific indication.\n"
                    "- Accurate flag transmission for Regulation 49 (urgent safety net supply) and Section 100 special supply arrangements.\n"
                    "- Validation of electronic prescription tokens (Active Script List - ASL) to eliminate duplicate script processing across different dispensaries.\n\n"
                    "## Avoiding Common Administrative Rejection Traps\n\n"
                    "Routine internal dispensary audits reveal recurring rejection triggers that cause claim rejections and payment delays:\n\n"
                    "1. Misaligned safety net category classifications (e.g. Concessional vs Safety Net Concessional cards pending renewal).\n"
                    "2. Missing or incorrect Streamlined Authority codes for restricted PBS items.\n"
                    "3. Failure to retain physical paperwork or electronic audit logs for non-barcoded or hospital-generated discharge scripts.\n\n"
                    "## Protecting Pharmacy Viability and Professional Services\n\n"
                    "Implementing an end-of-day claiming checklist—where the closing pharmacist reviews rejected and deferred claim queues before batch transmission—protects pharmacy cash flow, eliminates clawback vulnerabilities, and ensures full entitlement to 8CPA professional program incentives."
                ),
            },
            {
                'slug': 'rural-remote-pharmacy-network-resilience-cold-chain',
                'title': 'Rural & Remote Pharmacy Resilience: Cold Chain Continuity & Emergency Supply Hubs',
                'kind': 'news',
                'topic': 'community',
                'author_user': u_ramadan,
                'author_name': 'Ahmed Ramadan, Pharmacy Director',
                'cover_url': 'http://localhost:3000/images/editorial/regional_pharmacy_community.jpg',
                'cover_alt': 'Australian coastal regional community pharmacy storefront and locum team standing together',
                'source_name': 'Rural Pharmacy Maintenance Network Australia',
                'source_url': 'https://www.ruralhealth.org.au/',
                'featured': False,
                'published_at': now - timedelta(days=3, hours=11),
                'excerpt': 'How regional pharmacy teams and locums maintain uninterrupted medicine access during extreme weather events, bushfire power outages, and isolated supply routes across rural Australia.',
                'seo_title': 'Rural Pharmacy Network Resilience & Supply Hubs',
                'seo_description': 'Emergency medicine continuity, cold-chain backup systems, and locum solidarity across regional and remote Australian community pharmacies.',
                'body': (
                    "When bushfires, floods, or seasonal storms isolate regional Australian communities, the local community pharmacy frequently becomes the sole operating healthcare outpost. Across MMM 4 to MMM 7 rural and remote communities, proactive disaster preparedness and peer-to-peer network solidarity are vital to preserving public health.\n\n"
                    "## Emergency Dispensing Provisions Under National Disaster Declarations\n\n"
                    "Under state emergency declarations and Pharmaceutical Benefits Scheme Emergency Supply provisions, pharmacists are granted temporary statutory latitude to supply up to one month's standard PBS medicine supply to patients without a current prescription, provided previous therapy is clinically verified through dispensing records or My Health Record.\n\n"
                    "## Battery Backup and Secondary Temperature Datalogging Protocols\n\n"
                    "Maintaining the cold chain (2°C to 8°C) for insulins, biotherapeutics, and vaccines during grid failures is a high-stakes challenge. Accredited rural pharmacies employ:\n\n"
                    "- Uninterruptible Power Supply (UPS) battery systems paired with dedicated automatic generator failover switches.\n"
                    "- Dual-probe cellular IoT temperature loggers that broadcast SMS alerts to the pharmacist-on-call if chamber temperatures drift outside safe ranges for more than 15 minutes.\n"
                    "- Pre-conditioned insulated ice-brick cooler transport systems validated to maintain compliant storage for up to 48 hours in the event of mandatory premises evacuation.\n\n"
                    "## Section 100 Remote Area Supply Integration\n\n"
                    "In remote Aboriginal and Torres Strait Islander communities, Section 100 supply arrangements ensure eligible patients receive medications through participating clinics without co-payments. Dispensary teams work closely with Aboriginal Health Workers to provide pre-packed Dose Administration Aids (DAAs) tailored to cultural and environmental contexts.\n\n"
                    "## The Human Network: Peer-to-Peer Regional Locum Relief\n\n"
                    "The ChemistTasker locum community plays a decisive role in regional resilience. When regional owners face sudden staffing emergencies or fatigue after continuous crisis operations, flying in experienced locums maintains pharmacy opening hours and preserves critical community access to essential healthcare."
                ),
            },

            # ==========================================
            # LEARNING ARTICLES (topic='learning')
            # ==========================================
            {
                'slug': 'paediatric-dosing-calculations-liquid-formulations-guide',
                'title': "Paediatric Dosing Calculations: Weight-Based Titration, Liquid Suspensions & Clark's Rule",
                'kind': 'blog',
                'topic': 'learning',
                'author_user': u_basma,
                'author_name': 'Basma Soliman, Clinical Hospital & Community Pharmacist',
                'cover_url': 'http://localhost:3000/images/editorial/paediatric_dosing_calc.jpg',
                'cover_alt': 'Paediatric dosing calculations formula sheet with Australian Medicines Handbook, oral syringe and cylinder',
                'source_name': "Australian Medicines Handbook (AMH) Children's Dosing Companion",
                'source_url': 'https://amh.net.au/',
                'featured': True,
                'published_at': now - timedelta(hours=18),
                'excerpt': "A clinical refresher on converting mg/kg/day into divided doses, verifying paediatric suspension concentrations, calculating ideal body weight in overweight children, and zero-error dispensing habits.",
                'seo_title': 'Paediatric Dosing Calculations Masterclass',
                'seo_description': 'Step-by-step paediatric dose calculation tutorial covering mg/kg titration, liquid volume calculations, and safety cross-checks for dispensary staff.',
                'body': (
                    "Paediatric pharmacotherapy requires absolute precision. Children are not miniature adults; their hepatic clearance, renal glomerular filtration, and total body water distribution vary dramatically across developmental stages. A minor decimal misplacement can result in tenfold overdose.\n\n"
                    "## Core Principles of Weight-Based Paediatric Dosing\n\n"
                    "In Australian practice, the primary reference standard is the AMH Children's Dosing Companion. Dosing is almost universally expressed in milligrams per kilogram of actual body weight (mg/kg/dose or mg/kg/day in divided doses). For overweight or obese paediatric patients, pharmacists must cross-check whether ideal body weight (IBW) or actual weight should be used, particularly with hydrophilic agents like aminoglycosides.\n\n"
                    "## Converting Milligrams to Millilitres Across Commercial Strengths\n\n"
                    "A frequent source of dispensing calculation error occurs during conversion between prescribed milligrams and volume to administer (mL). Consider a common scenario:\n\n"
                    "- Patient: Child weighing 14 kg.\n"
                    "- Prescription: Amoxicillin 25 mg/kg/day divided into 3 equal doses for acute otitis media.\n"
                    "- Calculation 1 (Total daily dose): 14 kg × 25 mg/kg = 350 mg total daily.\n"
                    "- Calculation 2 (Individual dose): 350 mg ÷ 3 = 116.7 mg per dose (administered 8-hourly).\n"
                    "- Calculation 3 (Volume selection): Using Amoxicillin 125 mg/5 mL suspension:\n"
                    "  Volume (mL) = (116.7 mg ÷ 125 mg) × 5 mL = 4.67 mL per dose (rounded safely to 4.7 mL or adapted to 4.5–5 mL based on clinical context and calibrated oral syringe graduations).\n\n"
                    "Always calculate the required bottle quantity based on treatment duration: 4.7 mL × 3 times daily = 14.1 mL/day × 7 days = 98.7 mL total. A single 100 mL bottle is sufficient, provided reconstitution occurs accurately with purified water.\n\n"
                    "## Body Surface Area (BSA) vs Weight in High-Risk Medicines\n\n"
                    "For cytotoxic agents, complex corticosteroids, or therapeutic monoclonal antibodies, dosing calculated on Body Surface Area (m²) utilizing Mosteller's formula provides tighter physiological correlation:\n\n"
                    "BSA (m²) = √([Height (cm) × Weight (kg)] ÷ 3600)\n\n"
                    "## The 4-Step Counter Verification Routine Before Handover\n\n"
                    "To guarantee zero dispensing errors at the dispensary bench, mandate this 4-step routine:\n\n"
                    "1. Confirm child's current weight and age directly with the parent or guardian at check-in.\n"
                    "2. Independently verify the calculated single dose and 24-hour ceiling against AMH recommendations.\n"
                    "3. Demonstrate the exact measurement using an oral measuring syringe (never a domestic teaspoon).\n"
                    "4. Emphasize storage conditions (refrigeration vs room temperature) and write clear reconstituted expiry dates on the bottle."
                ),
            },
            {
                'slug': 'ahpra-pharmacy-board-exam-prep-clinical-scenarios-apf26',
                'title': 'AHPRA Board Exam Mastery: Clinical Problem-Solving, Forensic Scenarios & APF 26 Counseling',
                'kind': 'blog',
                'topic': 'learning',
                'author_user': u_exp,
                'author_name': 'Alex Chen, Intern Pharmacist & Student Liaison',
                'cover_url': 'http://localhost:3000/images/editorial/board_exam_prep.jpg',
                'cover_alt': 'Intern pharmacists studying Australian Pharmaceutical Formulary clinical cases together around a dispensary bench',
                'source_name': 'Australian Pharmacy Council Intern Examination Guide',
                'source_url': 'https://www.pharmacycouncil.org.au/',
                'featured': False,
                'published_at': now - timedelta(days=1, hours=14),
                'excerpt': 'Proven study blueprints for the Pharmacy Board of Australia oral and written registration examinations. Key dispensing red flags, APF counseling mnemonics, and timed communication strategies.',
                'seo_title': 'AHPRA Board Exam Guide & Oral Preparation',
                'seo_description': 'Complete revision blueprint for pharmacy interns preparing for the AHPRA oral examination and APC written registration exam in Australia.',
                'body': (
                    "Preparing for the Pharmacy Board of Australia Registration Examination is one of the most demanding milestones in an Australian pharmacy career. Success requires more than rote memorization; examiners assess your situational awareness, legal compliance, and structured clinical communication under pressure.\n\n"
                    "## Anatomy of the Oral Registration Examination\n\n"
                    "The oral examination structure comprises three core assessment streams:\n\n"
                    "1. Primary Health Care (OTC scenario requiring differential diagnosis, product recommendation, or medical referral).\n"
                    "2. Legal and Forensic Practice (evaluating state Poisons Regulations, prescription validity, Schedule 8 compliance, and forged script handling).\n"
                    "3. Problem-Solving in Practice (identifying significant drug interactions, contraindications, or dosing errors on complex hospital discharge or community prescriptions).\n\n"
                    "## High-Frequency Forensic Scenarios & Legal Traps\n\n"
                    "Examiners frequently introduce deceptive prescription scenarios to test vigilance:\n\n"
                    "- Schedule 8 Prescriptions: Checking prescriber authority numbers, repeat intervals, and date limits (e.g. Victorian 6-month validity vs standard 12-month PBS rules).\n"
                    "- Suspected Forgeries: Inconsistent handwriting, altered quantities, out-of-area prescribers, or unusual drug combinations (benzodiazepine + opioid + stimulant). Know the protocol: hold the prescription, contact the prescriber directly via verified telephone numbers (never the number printed on the suspect pad), and contact local Police / Poisons Control if fraud is confirmed.\n\n"
                    "## Active Listening & Structured Patient Counseling (PAM-F)\n\n"
                    "Use the time-tested PAM-F counseling structure in clinical stations:\n\n"
                    "- Purpose: Explain what the medicine is for in simple, jargon-free language.\n"
                    "- Administration: How to take it, timing with meals, swallow whole vs crush, and what to do if a dose is missed.\n"
                    "- Monitoring & Side Effects: What normal adaptation effects to expect vs red flag adverse reactions requiring urgent care.\n"
                    "- Follow-up: When to see the doctor or pharmacist again for clinical review.\n\n"
                    "## Mock Case Practice Routine Under Time Constraints\n\n"
                    "Practice aloud with preceptors and fellow interns. Setting a strict 10-minute countdown clock simulates exam adrenaline and trains you to pace information delivery calmly and authoritatively."
                ),
            },
            {
                'slug': 'schedule-8-safe-custody-cold-chain-compliance-sop',
                'title': 'Schedule 8 Controlled Drugs & Cold Chain Integrity: Complete Australian Dispensary SOP',
                'kind': 'blog',
                'topic': 'learning',
                'author_user': u_zaheer,
                'author_name': 'Zaheer Bassa, Operations & Quality Lead',
                'cover_url': 'http://localhost:3000/images/editorial/s8_cold_chain_protocols.jpg',
                'cover_alt': 'Schedule 8 controlled drug safe and Strive for 5 compliant digital vaccine refrigerator in pharmacy',
                'source_name': "National Vaccine Storage Guidelines 'Strive for 5'",
                'source_url': 'https://www.health.gov.au/resources/publications/national-vaccine-storage-guidelines-strive-for-5',
                'featured': False,
                'published_at': now - timedelta(days=2, hours=16),
                'excerpt': "Step-by-step compliance for Schedule 8 drug registers, monthly physical counts, witness destruction rules, and Strive for 5 vaccine temperature datalogger management.",
                'seo_title': 'Schedule 8 Safe Custody & Cold Chain SOP',
                'seo_description': 'Standard operating procedures for Schedule 8 controlled drugs custody and National Vaccine Storage Strive for 5 cold-chain compliance.',
                'body': (
                    "Controlled drug handling and cold chain management represent two of the most scrutinized regulatory areas in Australian pharmacy audits. Maintaining rigorous standard operating procedures (SOPs) is essential to ensure patient safety and avoid regulatory sanctions.\n\n"
                    "## Schedule 8 Register Maintenance and Daily Discrepancy Audits\n\n"
                    "Every community and hospital pharmacy must maintain a permanent Schedule 8 Register (either electronic compliant with state health regulations, or hard-bound with numbered pages):\n\n"
                    "- Real-Time Transaction Entry: Every receipt, dispensing, transfer, or return must be logged immediately upon occurrence, including patient name, address, prescriber, prescription number, quantity, and dispensing pharmacist signature.\n"
                    "- Daily Closing Balance Checks: Running totals must match physical inventory inside the Chubb S8 safe at the conclusion of every business day.\n"
                    "- Formal Monthly Balance Reconciliation: A formal physical stocktake must be conducted on a designated calendar day every month, signed by the Pharmacist-in-Charge.\n\n"
                    "## Destruction and Disposal Protocols Under Authorised Supervision\n\n"
                    "Patient-returned or expired S8 medications must never be discarded in ordinary medical waste. In accordance with State Health (Poisons) Regulations, destruction must occur in the presence of an authorized witness (e.g. an authorised Health Department inspector, registered medical practitioner, or a second registered pharmacist where permitted by state legislation), utilizing denaturing kits that render the active drug permanently non-recoverable.\n\n"
                    "## Maintaining the 2°C to 8°C Cold Chain Under 'Strive for 5'\n\n"
                    "The National Vaccine Storage Guidelines ('Strive for 5') require adherence to strict environmental controls:\n\n"
                    "1. Purpose-Built Vaccine Refrigerators: Domestic bar fridges are strictly prohibited for medicinal storage. Only purpose-built medical fridges with continuous forced-air circulation and glass doors are compliant.\n"
                    "2. Dual Temperature Monitoring: Ensure minimum/maximum thermometer readings are recorded twice daily (at opening and closing) and digital dataloggers are downloaded weekly to verify temperature curves.\n"
                    "3. Stock Placement: Store vaccines in their original cardboard packaging on middle shelves; avoid placing stock against refrigerator back walls or in bottom drawers where freezing risks are elevated.\n\n"
                    "## What to Do During a Temperature Excursion or Equipment Fault\n\n"
                    "If temperature logs reveal a breach below 2°C or above 8°C:\n\n"
                    "- Immediately isolate the stock in a separate compliant cooler or back-up fridge marked 'QUARANTINE - DO NOT DISPENSE'.\n"
                    "- Contact the state public health unit and medicine manufacturers with exact temperature ranges and duration data.\n"
                    "- Never discard or administer compromised vaccines without written manufacturer authorization."
                ),
            },
            {
                'slug': 'dispensary-technician-training-pbs-authority-streamlined-codes',
                'title': 'Dispensary Technician Training: PBS Streamlined Authorities, Brand Premiums & S4D Rules',
                'kind': 'blog',
                'topic': 'learning',
                'author_user': u_mia,
                'author_name': 'Mia Brennan, Lead Dispensary Technician',
                'cover_url': 'http://localhost:3000/images/editorial/dispensary_tech_training.jpg',
                'cover_alt': 'Lead dispensary technician explaining PBS authority codes and dispensing terminal interface to a trainee',
                'source_name': 'Society of Hospital Pharmacists of Australia (SHPA) Technician Standards',
                'source_url': 'https://www.shpa.org.au/',
                'featured': False,
                'published_at': now - timedelta(days=3, hours=19),
                'excerpt': 'Empower your dispensary support team. Master PBS authority requirements, Schedule 4 Appendix D repeats handling, brand price premiums vs therapeutic substitutions, and safety-net entitling.',
                'seo_title': 'Dispensary Tech Training: PBS Codes & S4D',
                'seo_description': 'Dispensary technician training guide on PBS streamlined codes, Schedule 4 Appendix D repeat rules, brand substitution, and safety net administration.',
                'body': (
                    "A well-trained dispensary technician is the backbone of an efficient, safe community pharmacy dispensary. By mastering PBS restrictions, authority coding, and Schedule 4 Appendix D regulations, dispensary technicians prevent claiming delays and free up pharmacists for clinical interventions.\n\n"
                    "## Demystifying PBS Authority Types: Phone vs Streamlined vs Written\n\n"
                    "Understanding PBS authority categories ensures prescriptions are processed cleanly on the first pass:\n\n"
                    "- Authority Required (Streamlined): The vast majority of restricted drugs (e.g. high-strength PPIs, statins, novel anticoagulants) require a 4-digit or 5-digit Streamlined Authority code issued by the prescriber. Technicians must verify that this code is entered accurately into the dispensing software.\n"
                    "- Authority Required (Telephone / Electronic Approval): For high-cost medicines or quantities exceeding schedule maximums, prescribers must obtain an individualized approval number from Services Australia before dispensing can take place.\n"
                    "- Authority Required (Written Approval): Highly specialized medicines require formal written application and approval documentation.\n\n"
                    "## Appendix D Controlled S4s: Mandatory Storage, Repeat Intervals & Validity\n\n"
                    "Schedule 4 Appendix D medicines (including benzodiazepines, anabolic steroids, z-drugs, and pseudoephedrine) carry heightened regulatory restrictions:\n\n"
                    "- Repeat Interval Enforcement: Dispensing repeats ahead of prescribed intervals is prohibited unless the prescriber explicitly endorses the prescription with 'urgent supply' or 'leave on overseas travel'.\n"
                    "- Prescription Expiry: In many Australian states, S4D scripts expire 6 months from the date of prescribing, contrasting with standard 12-month S4 items.\n\n"
                    "## Managing Brand Price Premiums and Patient Consent for Generic Substitution\n\n"
                    "Under Australian PBS policy, bioequivalent generic brands are interchangeable (marked as 'a-flagged' in the schedule). Technicians must skillfully counsel patients regarding:\n\n"
                    "- Brand Price Premiums: Explaining that price differences arise from manufacturer surcharges rather than efficacy or quality differences.\n"
                    "- Informed Consent: Always confirming that the patient agrees to generic substitution before printing labels and packing medications.\n\n"
                    "## Streamlined Dispensary Handover to the Checking Pharmacist\n\n"
                    "Ensure the assembled basket contains the original prescription, patient profile screen, reconstituted product (if liquid), and any new patient CMIs neatly arranged so the final checking pharmacist can complete the 5-rights clinical check without friction."
                ),
            },
        ]

        created_count = 0
        updated_count = 0

        for item in articles_data:
            slug = item.pop('slug')
            article, created = Article.objects.update_or_create(
                slug=slug,
                defaults={
                    'title': item['title'],
                    'kind': item['kind'],
                    'topic': item['topic'],
                    'excerpt': item['excerpt'],
                    'body': item['body'],
                    'cover_url': item['cover_url'],
                    'cover_alt': item['cover_alt'],
                    'source_name': item['source_name'],
                    'source_url': item['source_url'],
                    'author_name': item['author_name'],
                    'created_by': item['author_user'],
                    'status': 'published',
                    'published_at': item['published_at'],
                    'featured': item['featured'],
                    'comments_open': True,
                    'seo_title': item['seo_title'][:70],
                    'seo_description': item['seo_description'][:170],
                }
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"Created article: [{article.kind}] {article.title} ({article.topic})"))
            else:
                updated_count += 1
                self.stdout.write(f"Updated article: [{article.kind}] {article.title} ({article.topic})")

            # Add thoughtful sample discussion and reactions to make it dynamic
            if article.comments.count() == 0:
                if article.kind == 'news':
                    c1 = Comment.objects.create(
                        article=article,
                        author=u_abas if article.created_by != u_abas else u_salah,
                        body="Crucial update for community teams. We have already incorporated this into our morning dispensary huddle. Highly recommend everyone check their software settings."
                    )
                    Comment.objects.create(
                        article=article,
                        author=u_admin,
                        parent=c1,
                        body="Agreed. Our banner group has updated the standardized SOPs to reflect this guidance across all stores."
                    )
                else:
                    c1 = Comment.objects.create(
                        article=article,
                        author=u_exp if article.created_by != u_exp else u_basma,
                        body="This breakdown is crystal clear! The step-by-step calculation and verification checklist is exactly what interns and new locums need at the bench."
                    )
                    Comment.objects.create(
                        article=article,
                        author=u_zaheer,
                        parent=c1,
                        body="Great clinical reference. Sharing this with our regional team for this week's clinical CPD session."
                    )

            # Add authentic reactions
            for u in [u_salah, u_abas, u_admin, u_basma, u_zaheer]:
                if u:
                    Reaction.objects.get_or_create(article=article, user=u, defaults={'kind': 'insightful'})

        self.stdout.write(self.style.SUCCESS(
            f"\nFinished seeding editorial content! Total created: {created_count}, updated: {updated_count}."
        ))
