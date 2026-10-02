import { downloadSavedClinicalPdf } from '../pdf/savedClinicalPdf';

export async function exportAnamnesisAsPdf({record}) {
    await downloadSavedClinicalPdf('anamnesisRecordId',record?.id);
}
