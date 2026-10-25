/**
 * Today's brain fact: a curated, sourced list shown one per day.
 *
 * Every claim here was checked against the linked source (NCI, NIBIB, or the PubMed record of the
 * original paper). Add facts the same way: one checkable claim, plain wording, no diagnostic advice.
 *
 * The order is fixed and interleaves categories, so consecutive days differ. Day N shows fact
 * N mod length: every fact is shown once before any repeats, and everyone sees the same fact
 * because the day is counted in one fixed time zone.
 */
export type FactCategory = 'Tumor biology' | 'MRI imaging' | 'Neuroanatomy' | 'Segmentation';

export interface BrainFact { title: string; body: string; category: FactCategory; source: { label: string; url: string } }

const NCI_ADULT = { label: 'National Cancer Institute, Adult Central Nervous System Tumors (PDQ)', url: 'https://www.cancer.gov/types/brain/hp/adult-brain-treatment-pdq' };
const NIBIB_MRI = { label: 'NIBIB, Magnetic Resonance Imaging (MRI)', url: 'https://www.nibib.nih.gov/science-education/science-topics/magnetic-resonance-imaging-mri' };
const AZEVEDO = { label: 'Azevedo et al., J Comp Neurol 2009', url: 'https://pubmed.ncbi.nlm.nih.gov/19226510/' };
const MENZE = { label: 'Menze et al., The BRATS benchmark, IEEE TMI 2015', url: 'https://pubmed.ncbi.nlm.nih.gov/25494501/' };

export const FACTS: readonly BrainFact[] = [
  {
    title: 'Gliomas grow from glial cells, not from neurons.',
    body: 'Glial cells such as astrocytes support and protect nerve cells. When they form tumors, those tumors are called gliomas, the tumor type in every scan in Lobe’s library.',
    category: 'Tumor biology',
    source: { label: 'National Cancer Institute, Adult Central Nervous System Tumors (PDQ, patient version)', url: 'https://www.cancer.gov/types/brain/patient/adult-brain-treatment-pdq' },
  },
  {
    title: 'An MRI scanner images the protons in your body’s water.',
    body: 'A strong magnet lines the protons up, radio pulses knock them out of line, and the signal they give off as they realign becomes the image. That is why soft tissue like the brain shows so clearly.',
    category: 'MRI imaging',
    source: NIBIB_MRI,
  },
  {
    title: 'The adult human brain has about 86 billion neurons.',
    body: 'Counting cell nuclei directly, researchers found roughly 86 billion neurons and a similar number of non-neuronal cells, overturning the often quoted 100 billion neurons and ten glial cells for every one.',
    category: 'Neuroanatomy',
    source: AZEVEDO,
  },
  {
    title: 'Even experts disagree on where a tumor ends.',
    body: 'In the BRATS benchmark, human raters outlining the same brain tumors overlapped with each other by only 74% to 85% (Dice score) across tumor sub-regions. Outlining is genuinely hard.',
    category: 'Segmentation',
    source: MENZE,
  },
  {
    title: 'Meningiomas are the most common primary brain tumor.',
    body: 'They grow from the meninges, the membranes that wrap the brain and spinal cord, rather than from brain tissue itself. Higher-grade meningiomas are very rare.',
    category: 'Tumor biology',
    source: { label: 'National Cancer Institute, Meningioma', url: 'https://www.cancer.gov/rare-brain-spine-tumor/tumors/meningioma' },
  },
  {
    title: 'FLAIR turns fluid dark so nearby lesions stand out.',
    body: 'A long inversion time suppresses the signal from cerebrospinal fluid while keeping heavy T2 weighting, so lesions beside the ventricles become far easier to see. Lobe’s slice games use FLAIR.',
    category: 'MRI imaging',
    source: { label: 'Hajnal et al., J Comput Assist Tomogr 1992', url: 'https://pubmed.ncbi.nlm.nih.gov/1430427/' },
  },
  {
    title: 'Only about 19% of your neurons live in the cerebral cortex.',
    body: 'The cortex makes up 82% of the brain’s mass, but most neurons are packed elsewhere, chiefly in the cerebellum.',
    category: 'Neuroanatomy',
    source: AZEVEDO,
  },
  {
    title: 'In adults, brain metastases outnumber primary brain tumors at least 10 to 1.',
    body: 'Cancers that start elsewhere and spread to the brain are far more common than tumors that start in it. They occur in an estimated 20% to 40% of people with cancer.',
    category: 'Tumor biology',
    source: NCI_ADULT,
  },
  {
    title: 'MRI uses no ionizing radiation.',
    body: 'Unlike X-rays and CT, MRI builds its images from magnets and radio waves, and it shows the brain, spinal cord and nerves much more clearly than X-rays or CT.',
    category: 'MRI imaging',
    source: NIBIB_MRI,
  },
  {
    title: 'Tumors are outlined as three nested regions.',
    body: 'Brain tumor benchmarks label edema, tumor core and enhancing tumor, each inside the last. Lobe’s 3D layers and outlines use the same three regions.',
    category: 'Segmentation',
    source: MENZE,
  },
  {
    title: 'Seven in ten medulloblastomas occur in children.',
    body: 'This fast-growing tumor most often forms in the cerebellum, at the back and bottom of the brain. In adults it usually appears between ages 20 and 40.',
    category: 'Tumor biology',
    source: { label: 'National Cancer Institute, Medulloblastoma', url: 'https://www.cancer.gov/rare-brain-spine-tumor/tumors/medulloblastoma' },
  },
  {
    title: 'The brain is about 2% of body weight but uses about 20% of its energy.',
    body: 'Much of that energy goes to the brain’s ongoing activity at rest, not just to the work of a task.',
    category: 'Neuroanatomy',
    source: { label: 'Raichle & Gusnard, PNAS 2002', url: 'https://pubmed.ncbi.nlm.nih.gov/12149485/' },
  },
  {
    title: 'Contrast agents make tissue brighter by speeding up its protons.',
    body: 'Gadolinium-based agents injected before or during a scan help nearby protons realign faster, and faster realignment shows up brighter on the image.',
    category: 'MRI imaging',
    source: NIBIB_MRI,
  },
  {
    title: 'Since 2021, glioblastoma has been defined partly by its genes.',
    body: 'The fifth WHO classification made molecular markers part of diagnosis. Glioblastoma is now IDH-wildtype by definition; IDH-mutant grade 4 tumors are classed as astrocytomas.',
    category: 'Tumor biology',
    source: { label: 'Louis et al., Neuro-Oncology 2021', url: 'https://pubmed.ncbi.nlm.nih.gov/34185076/' },
  },
  {
    title: 'Broca’s famous patients had damage deeper than Broca’s area.',
    body: 'When the two preserved brains Broca studied in the 1860s were scanned with modern MRI, both lesions extended well into medial regions, not only the surface area now named after him.',
    category: 'Neuroanatomy',
    source: { label: 'Dronkers et al., Brain 2007', url: 'https://pubmed.ncbi.nlm.nih.gov/17405763/' },
  },
  {
    title: 'Lobe’s scans come from a ten-task AI challenge.',
    body: 'The Medical Segmentation Decathlon asked one method to segment ten different problems, from brain tumors to the liver. The brain tumor task supplies Lobe’s library.',
    category: 'Segmentation',
    source: { label: 'Antonelli et al., Nature Communications 2022', url: 'https://pubmed.ncbi.nlm.nih.gov/35840566/' },
  },
  {
    title: 'Lung cancer is the most common source of brain metastases.',
    body: 'Among people whose cancer spreads to the brain, lung cancer leads the list, followed by breast cancer. Melanoma and cancers of unknown origin are other common sources.',
    category: 'Tumor biology',
    source: NCI_ADULT,
  },
  {
    title: 'Losing both hippocampi can stop new memories from forming.',
    body: 'In 1957, Scoville and Milner described patients, most famously H.M., who could no longer form lasting new memories after surgery removed the hippocampus on both sides.',
    category: 'Neuroanatomy',
    source: { label: 'Scoville & Milner, J Neurol Neurosurg Psychiatry 1957', url: 'https://pubmed.ncbi.nlm.nih.gov/13406589/' },
  },
  {
    title: 'Adding temozolomide to radiotherapy extended glioblastoma survival.',
    body: 'In the 2005 trial that set the standard first treatment, median survival was 14.6 months with radiotherapy plus temozolomide, against 12.1 months with radiotherapy alone.',
    category: 'Tumor biology',
    source: { label: 'Stupp et al., New England Journal of Medicine 2005', url: 'https://pubmed.ncbi.nlm.nih.gov/15758009/' },
  },
  {
    title: 'Better MRI may be raising the count of brain metastases.',
    body: 'Part of the apparent increase is that MRI now detects small metastases that older imaging missed, alongside people living longer with cancer.',
    category: 'MRI imaging',
    source: NCI_ADULT,
  },
  {
    title: 'Expert outlines are often edited, not drawn from scratch.',
    body: 'For one widely used glioma collection, software drew the first tumor labels and a board-certified neuroradiologist then revised them by hand.',
    category: 'Segmentation',
    source: { label: 'Bakas et al., Scientific Data 2017', url: 'https://pubmed.ncbi.nlm.nih.gov/28872634/' },
  },
  {
    title: 'A grade 1 brain tumor can sometimes be cured by surgery alone.',
    body: 'WHO grades describe behaviour: grade 1 tumors grow slowly and are often well defined, while grade 2 tumors are usually infiltrating and come back more often.',
    category: 'Tumor biology',
    source: NCI_ADULT,
  },
];

/** The day boundary everyone shares: midnight in California, where Lobe was built. */
const ZONE = 'America/Los_Angeles';

/** Whole days since 1970-01-01 for the calendar date `now` falls on in ZONE. */
export function dayNumber(now: Date, zone = ZONE): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Math.floor(Date.UTC(get('year'), get('month') - 1, get('day')) / 86_400_000);
}

export const factFor = (now: Date, facts: readonly BrainFact[] = FACTS, zone = ZONE): BrainFact => facts[dayNumber(now, zone) % facts.length];
