"""Generate one fictional reference property's shared sample vault PDFs. Requires reportlab and Node.

Run: python3 scripts/generate_sample_documents.py
Then copy output/pdf/*.pdf into server/assets/vault/ for deployment.
No real title records, signatures, inspections, or investment forecasts are used.
"""
import argparse
import json
import shutil
import os
import subprocess
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
NAVY = colors.HexColor('#172C40')
TEAL = colors.HexColor('#176D74')
GRAY = colors.HexColor('#566573')
PALE = colors.HexColor('#EEF3F6')
STYLES = getSampleStyleSheet()
STYLES.add(ParagraphStyle(name='DocTitle', fontName='Helvetica-Bold', fontSize=24, leading=28, textColor=NAVY, spaceAfter=10))
STYLES.add(ParagraphStyle(name='DocSub', fontName='Helvetica', fontSize=11, leading=16, textColor=GRAY, spaceAfter=14))
STYLES.add(ParagraphStyle(name='SectionTitle', fontName='Helvetica-Bold', fontSize=11, leading=15, textColor=TEAL, spaceBefore=13, spaceAfter=7))
STYLES.add(ParagraphStyle(name='Copy', fontName='Helvetica', fontSize=9.5, leading=14, textColor=NAVY, spaceAfter=9))
STYLES.add(ParagraphStyle(name='SmallCopy', fontName='Helvetica', fontSize=8, leading=11, textColor=GRAY, spaceAfter=6))
STYLES.add(ParagraphStyle(name='Cell', fontName='Helvetica', fontSize=8, leading=11, textColor=NAVY))
STYLES.add(ParagraphStyle(name='HeadCell', parent=STYLES['Cell'], fontName='Helvetica-Bold', textColor=colors.white))


def ascii_text(value):
    return str(value).replace('×', ' x ').replace('—', '-').replace('–', '-').replace('’', "'")


def p(value, style='Copy'):
    return Paragraph(escape(ascii_text(value)), STYLES[style])


def table(rows, widths, header=True):
    values = [[p(v, 'HeadCell' if header and i == 0 else 'Cell') for v in row] for i, row in enumerate(rows)]
    t = Table(values, colWidths=widths, hAlign='LEFT', repeatRows=1 if header else 0)
    commands = [('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 7),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 7), ('LINEBELOW', (0, 0), (-1, -1), .4, colors.HexColor('#D6E0E6'))]
    if header:
        commands += [('BACKGROUND', (0, 0), (-1, 0), NAVY), ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, PALE])]
    else:
        commands += [('BACKGROUND', (0, 0), (0, -1), PALE)]
    t.setStyle(TableStyle(commands))
    return t


def section(title, text):
    return [p(title, 'SectionTitle'), p(text)]


def heading(prop, title, code):
    return [p(title, 'DocTitle'), p(f"{prop['title']} | {prop['location']}", 'DocSub'),
            table([['Document control', code], ['Prepared / model date', 'October 16, 2026'],
                   ['Status', 'SAMPLE - FICTIONAL / NOT VERIFIED']], [140, 364], header=False), Spacer(1, 12)]


def build(path, prop, kind, content):
    def decorate(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(TEAL)
        canvas.rect(0, 756, 612, 36, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont('Helvetica-Bold', 9)
        canvas.drawString(54, 770, 'REALTYCHAIN  /  SAMPLE DOCUMENT LIBRARY')
        canvas.setFillColor(colors.HexColor('#EDF1F4'))
        canvas.translate(306, 390)
        canvas.rotate(38)
        canvas.setFont('Helvetica-Bold', 58)
        canvas.drawCentredString(0, 0, 'SAMPLE ONLY')
        canvas.restoreState()
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor('#CDD7DE'))
        canvas.line(54, 48, 558, 48)
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(GRAY)
        canvas.drawString(54, 35, f"RC-{prop['id']} | {kind.upper()} | Fictional sample - not an official property record")
        canvas.drawRightString(558, 35, f'Page {doc.page} of 2')
        canvas.restoreState()
    doc = SimpleDocTemplate(str(path), pagesize=(612, 792), rightMargin=54, leftMargin=54,
                            topMargin=58, bottomMargin=64, title=f"SAMPLE - {prop['title']} - {kind}",
                            author='RealtyChain sample document library', pageCompression=1)
    doc.build(content, onFirstPage=decorate, onLaterPages=decorate)


def deed(prop):
    n = prop['id']
    content = heading(prop, 'Property Deed', f'RC-{n}-DEED / SPECIMEN v1.0')
    content += [p('UNSIGNED SPECIMEN - NOT FOR RECORDING', 'SectionTitle'),
                p('This fictional conveyance illustrates a deed document in the investor vault. It does not transfer title. No legal description, title search, recording, notarization, or execution has been completed.')]
    content += [table([['Transaction field', 'Illustrative entry'],
                       ['Grantor', f'RC Sample Seller {n} LLC (fictional entity)'],
                       ['Grantee', f'RC Property {n} SPV LLC (fictional entity)'],
                       ['Property reference', f"Catalog property {n}: {prop['title']}"],
                       ['Location', prop['location']],
                       ['Illustrative consideration', f"USD {prop['price']:,.2f} (catalog asking price; not evidence of payment)"],
                       ['Parcel / recording reference', f'RC-DEMO-{int(n):03d}; no actual parcel number or recording reference']], [145, 359])]
    content += section('1. Illustrative conveyance', 'For the illustrative consideration stated above, Grantor would convey its interest in the property identified in Exhibit A to Grantee, together with related improvements and appurtenant rights, subject to the exceptions listed in that exhibit. This example contains no representation that Grantor owns the property.')
    content += section('2. Capacity and title', 'The example assumes a transfer between legal entities through authorized signatories. Actual ownership, authority, vesting language, warranties, tax treatment, and applicable local recording requirements require independently prepared transaction documents.')
    content += [PageBreak(), p('Exhibit A & execution schedule', 'DocTitle')]
    content += section('A1. Property identification - illustrative only', f"Catalog ID {n}; {prop['title']}; {prop['location']}. Property configuration: {prop.get('unitMix') or ', '.join(prop['features'][:3])}. No street address, surveyed boundary, condominium declaration, lot/block description, or registry reference is supplied by this sample.")
    content += section('A2. Legal description and interests', 'A valid legal description would be attached from verified title and survey records. For a condominium, the unit, common interests, declaration, and recorded amendments would also be identified. This catalog description must not be used as a legal description.')
    content += section('A3. Exceptions to be established', 'Recorded easements, covenants, restrictions, taxes and assessments, existing tenancies, association interests, liens, and other title exceptions must be established from actual due diligence. This list is illustrative and does not certify that any exception exists or is absent.')
    content += [p('Execution schedule - intentionally blank', 'SectionTitle'),
                table([['Required item', 'Sample status'], ['Grantor authorized signatory', 'UNSIGNED - no person has executed this specimen'],
                       ['Grantee acknowledgment / acceptance', 'UNSIGNED - subject to actual transaction requirements'],
                       ['Notarial acknowledgment', 'NOT PERFORMED - no seal, commission, or attestation'],
                       ['Delivery and recording', 'NOT DELIVERED / NOT RECORDED'],
                       ['Prepared by / return to', 'Fictional sample; actual preparer and return address not provided']], [180, 324])]
    content += section('Relationship to investor governance', 'The grantee SPV shown here is fictional and is not the SPV configured in the app. This specimen neither binds investors, the SPV, or the owner nor replaces the DAO agreement. An actual deed and the executed governance agreement serve different purposes.')
    return content


def money(value):
    return f'${int(value):,}'


def rounded(value):
    return int(Decimal(str(value)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def assumptions(prop):
    if prop['id'] == '26':
        return 216000, 90000, 8000, .65
    return (prop['grossRentMonthly'] or 5200, prop['opexMonthly'] or 1500,
            prop['reservesMonthly'] or 350, (prop['occupancyPercent'] or 75) / 100)


def model(prop, year, occ=None, rent_factor=1, expense_factor=1):
    monthly, cost, reserve, occupancy = assumptions(prop)
    if occ is not None:
        occupancy = occ
    gross = rounded(monthly * 12 * (1.03 ** year) * rent_factor)
    collected = rounded(gross * occupancy)
    opex = rounded(cost * 12 * (1.025 ** year) * expense_factor)
    reserves = rounded(reserve * 12 * (1.025 ** year))
    noi = collected - opex
    cash = noi - reserves
    distribution = max(0, rounded(cash * .8))
    return [gross, gross-collected, collected, opex, noi, reserves, cash, distribution, cash-distribution]


def financials(prop):
    base = model(prop, 0)
    monthly, cost, reserve, occ = assumptions(prop)
    occupancy = rounded(occ * 100)
    content = heading(prop, 'Financial Projections', f"RC-{prop['id']}-FIN / MODEL v1.0")
    content += [p('Illustrative unlevered operating forecast | Calendar years 2027-2031', 'SectionTitle'),
                p('USD, nominal dollars. This fictional model uses catalog seed data as its starting point; no leases, invoices, bank records, or market comparables were verified. Results are assumptions, not promised returns.')]
    content += [table([['Model input', 'Base assumption'], ['Reference acquisition value', money(prop['price']) + ' (catalog asking price)'],
                       ['Potential monthly rent at 100% occupancy', money(monthly)],
                       ['Modeled economic occupancy', f'{occupancy}% each year; vacancy loss applied to potential rent'],
                       ['Rent / expense / reserve growth', '3.0% / 2.5% / 2.5% annually'],
                       ['Year 1 operating expenses / reserve', f'{money(base[3])} / {money(base[5])} per year'],
                       ['Distribution / retention', '80% / 20% of positive cash after reserves'],
                       ['Financing / investor units', f"No debt; {prop['totalTokens']:,} equally weighted units, assumed fully issued"]], [205, 299])]
    if prop['grossRentMonthly'] == 0:
        content += [p(f'Pre-operating property: current catalog operating figures are zero. The future stabilized scenario assumes monthly potential revenue {money(monthly)}, expenses {money(cost)}, reserves {money(reserve)}, and {occupancy}% occupancy. No current income is implied.', 'SmallCopy')]
    if prop['id'] == '26':
        content += [p('Hotel revenue assumption: 48 keys x $150 assumed average daily rate x 30 normalized nights = $216,000 monthly potential room revenue. No restaurant or ancillary revenue is included. Operating costs are an invented stabilized allowance.', 'SmallCopy')]
    content += section('Method and expense scope', 'Annual potential rent equals monthly rent x 12. Collected rent equals potential rent x economic occupancy. NOI equals collected rent less operating expenses. The catalog operating expense assumption is treated as inclusive of property taxes, insurance, management, routine repairs, and administration; no second management fee is deducted. Reserves are deducted after NOI.')
    content += section('Investor cash interpretation', f"Year 1 modeled distribution is {money(base[7])}, or ${base[7]/prop['totalTokens']:,.2f} per assumed unit. Cash distribution yield on the reference acquisition value is {base[7]/prop['price']*100:.2f}%. This differs from the catalog headline return, which is not used as a model input.")
    content += [PageBreak(), p('Five-year operating forecast', 'DocTitle'), p('USD, rounded to whole dollars; all rows reconcile to the displayed amounts.', 'DocSub')]
    forecasts = [model(prop, i) for i in range(5)]
    labels = ['Potential rent', 'Vacancy / collection loss', 'Collected rent', 'Operating expenses', 'Net operating income', 'Reserve contribution', 'Cash after reserves', 'Investor distribution', 'Retained cash']
    rows = [['Operating line'] + [str(y) for y in range(2027, 2032)]]
    for i, label in enumerate(labels):
        rows.append([label] + [money(f[i]) for f in forecasts])
    content += [table(rows, [154, 70, 70, 70, 70, 70])]
    content += [p('Year 1 sensitivity - independent scenarios', 'SectionTitle')]
    occ = occupancy / 100
    downside = model(prop, 0, max(0, occ-.1), 1, 1.15)
    upside = model(prop, 0, min(1, occ+.05), 1.05, 1)
    content += [table([['Scenario', 'Occupancy', 'NOI', 'Distribution'],
                       ['Downside: costs +15%', f'{max(0,occ-.1)*100:.0f}%', money(downside[4]), money(downside[7])],
                       ['Base case', f'{occupancy}%', money(base[4]), money(base[7])],
                       ['Upside: rent +5%', f'{min(1,occ+.05)*100:.0f}%', money(upside[4]), money(upside[7])]], [194, 80, 115, 115])]
    content += section('Exclusions and decision limits', f"Five-year investor distributions total {money(sum(f[7] for f in forecasts))}. This excludes an asset sale, debt service, acquisition/disposal costs, major capital projects, SPV-level taxes and investor taxes. No IRR or total return is asserted. Actual costs can exceed reserves, distributions may be reduced or suspended, and liquidity is not assumed.")
    return content


FINDINGS = {
 '1': [('Electrical', 'High', 'Open junction cover in utility cupboard; isolate access and have an electrician inspect.', 350, 800), ('Wet areas', 'Medium', 'Discolored sealant at shower tray; renew seals and check for concealed moisture.', 400, 950), ('HVAC', 'Medium', 'Service records unavailable; service fan-coil units and verify condensate drainage.', 500, 1100)],
 '2': [('Pool safety', 'High', 'Self-closing pool gate did not latch in the fictional scenario; restrict pool access pending repair.', 600, 1400), ('Coastal envelope', 'Medium', 'Salt corrosion at exterior metal fixtures; clean, treat, and review fastening integrity.', 1200, 2800), ('Water intrusion', 'Medium', 'Moisture staining near terrace slider; specialist water testing recommended.', 900, 2200)],
 '3': [('Fire protection', 'High', 'Annual alarm/sprinkler service evidence missing; obtain records and qualified review.', 1800, 4200), ('Roof drainage', 'Medium', 'Debris at roof drains; clear drains and inspect membrane seams.', 1500, 3500), ('Mechanical plant', 'Medium', 'Deferred filter and belt servicing assumed; commission an HVAC service review.', 2500, 5500)],
 '4': [('Combustion safety', 'High', 'Fireplace flue service history unavailable; do not use before specialist inspection.', 650, 1500), ('Deck structure', 'Medium', 'Localized weathering at deck connections; carpenter review before loading.', 1200, 3000), ('Winterization', 'Medium', 'Freeze protection and vacant-property checks not documented; test and establish routine.', 500, 1200)],
 '5': [('Egress', 'High', 'Storage obstructs a secondary exit in the sample scenario; clear immediately and verify door operation.', 100, 350), ('Storefront', 'Medium', 'Perimeter sealant is split at display glazing; reseal and test after cure.', 700, 1600), ('Ventilation', 'Medium', 'Service documentation unavailable; inspect supply/extract operation for intended use.', 800, 1800)],
 '6': [('Life safety', 'High', 'Smoke/CO alarm test records missing; test and replace units as required after specialist review.', 350, 850), ('Masonry', 'Medium', 'Localized mortar erosion observed in the fictional survey; obtain conservation-compatible repair scope.', 2000, 5000), ('Basement moisture', 'Medium', 'Efflorescence assumed at lower wall; investigate drainage and moisture source before finishes.', 1200, 3200)],
}


def inspection(prop):
    fallback = '3' if prop.get('bedrooms') is None else '1'
    if any(word in prop['title'].lower() for word in ['retail', 'grocery']):
        fallback = '5'
    if 'cabin' in prop['title'].lower():
        fallback = '4'
    findings = FINDINGS.get(prop['id'], FINDINGS[fallback])
    content = heading(prop, 'Inspection Report', f"RC-{prop['id']}-INSP / SCENARIO v1.0")
    content += [p('FICTIONAL DESKTOP SCENARIO - NO SITE VISIT PERFORMED', 'SectionTitle'),
                p('Prepared for the sample investor vault. All conditions, observations, and repair budgets below are invented to demonstrate reporting format. No inspector attended the property, tested equipment, or issued a professional opinion.')]
    content += [table([['Inspection profile', 'Scenario scope'], ['Property configuration', prop.get('unitMix') or ', '.join(prop['features'][:3])],
                       ['Scenario date / method', 'October 16, 2026 / fictional visual inspection scenario'],
                       ['Inspector / license', 'No inspector engaged; no license or certification represented'],
                       ['Access / weather / occupancy', 'Not observed; no access, weather, or occupant interview records'],
                       ['Records available', 'Catalog description only; no plans, service logs, surveys, or inspection photographs']], [155, 349])]
    content += section('Executive summary', f'This scenario contains {len(findings)} repair or investigation items: one high-priority item and two medium-priority items. The high-priority item would need prompt qualified review if present in reality. This sample is not a statement of habitability, code compliance, structural adequacy, or suitability for purchase.')
    content += [table([['System / area', 'Scenario review status'], ['Structure / foundations', 'Not assessed; specialist review required for actual conclusions'],
                       ['Roof / exterior / drainage', 'Visible-condition example only; concealed components excluded'],
                       ['Electrical / plumbing / HVAC', 'No operational, safety, or performance testing performed'],
                       ['Environmental / accessibility', 'Asbestos, lead, mold, radon, flood risk, and accessibility not evaluated']], [175, 329])]
    content += [PageBreak(), p('Findings & action register', 'DocTitle'), p('Fictional findings and budget allowances - not contractor quotations.', 'DocSub')]
    content += [table([['Item / priority', 'Illustrative observation and recommended action', 'Budget range'],
                       *[[f'{i+1:02d}. {area}\n{priority}', text, f'{money(low)} - {money(high)}'] for i,(area,priority,text,low,high) in enumerate(findings)]], [105, 284, 115])]
    content += section('Priority and follow-up', 'High: if verified, address access or safety exposure promptly and obtain an appropriately qualified assessment. Medium: obtain a written scope and quote before scheduling planned repairs. Timing here is illustrative and does not replace statutory requirements, emergency procedures, or agreement deadlines.')
    low = sum(f[3] for f in findings); high = sum(f[4] for f in findings)
    content += section('Budget and exclusions', f'The aggregate sample allowance is {money(low)} to {money(high)}, before taxes, permits, specialist design, concealed defects, and contingency. These invented allowances are not market quotes and are not included as a separate capital expenditure line in the financial projection. Approved work may require additional funding.')
    content += section('Governance and work responsibility', 'The SPV should coordinate review under the DAO agreement, obtain evidence, and assign authorized property work to the owner or an appointed service provider. The actual responsible party and deadlines must follow the executed agreement. A ticket records assignment and progress; it does not verify the condition or certify the repair.')
    content += section('Limitations and completion evidence', 'A real inspection should identify its scope, inspector credentials, access restrictions, photographs, testing methods, and applicable standards. Obtain licensed specialist reports where appropriate. Completion should be supported by invoices, photographs, test results, permits, and a follow-up assessment as needed. This sample has no signature or professional certification.')
    return content


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--node', default=os.environ.get('NODE_BINARY') or shutil.which('node') or '/home/webdev/.nvm/versions/node/v22.23.2/bin/node')
    args.add_argument('--output-dir', type=Path, default=ROOT / 'output/pdf')
    args.add_argument('--bundle', action='store_true', help='Also copy PDFs into server/assets/vault')
    opts = args.parse_args()
    catalog = json.loads(subprocess.check_output([opts.node, '-e', "process.stdout.write(JSON.stringify(require('./server/mock/properties').properties))"], cwd=ROOT))
    opts.output_dir.mkdir(parents=True, exist_ok=True)
    bundled = ROOT / 'server/assets/vault'
    if opts.bundle:
        bundled.mkdir(parents=True, exist_ok=True)
    for prop in [next(prop for prop in catalog if str(prop['id']) == '1')]:
        for kind, maker in [('deed', deed), ('financials', financials), ('inspection', inspection)]:
            file = opts.output_dir / f"sample-{kind}.pdf"
            build(file, prop, kind, maker(prop))
            if opts.bundle and file.resolve().parent != bundled.resolve():
                shutil.copyfile(file, bundled / file.name)
            print(file.relative_to(ROOT) if file.is_relative_to(ROOT) else file)


if __name__ == '__main__':
    main()
