export const fieldClass = 'mt-1 w-full bg-void-700 border border-void-600 rounded-xl px-3 py-2.5 text-cream-100';

export const PROPERTY_TYPES = ['Multifamily', 'Duplex', 'Condo', 'Single family', 'Retail', 'Office', 'Industrial', 'Mixed use'];

export const OWNER_DOCUMENTS = [
  { kind: 'deed', label: 'Deed' },
  { kind: 'appraisal', label: 'Appraisal' },
  { kind: 'inspection', label: 'Inspection' },
  { kind: 'insurance', label: 'Insurance' },
  { kind: 'tax', label: 'Tax documents' },
] as const;

export function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const comma = raw.indexOf(',');
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}
