import * as engine from '../../../supabase/functions/_shared/clinical-arithmetic.js';
/** Typed boundary; the exact runtime engine remains unchanged and independently tested. */
export interface ClinicalFraction { numerator: string; denominator: string; }
export type ArithmeticOperation = 'add' | 'subtract' | 'multiply' | 'divide';
export interface ClinicalNode { operation: string; label: string; value: number; unit: string; exact: ClinicalFraction; operands?: ClinicalNode[]; }
export function decimalFraction(value: number | string): ClinicalFraction { return engine.decimalFraction(value); }
export function exactOperation(operation: ArithmeticOperation, operands: [ClinicalFraction, ClinicalFraction]): ClinicalFraction { return engine.exactOperation(operation, operands); }
export function fractionNumber(value: ClinicalFraction): number { return engine.fractionNumber(value); }
export function roundClinicalFraction(value: ClinicalFraction, places?: number): string { return engine.roundClinicalFraction(value, places); }
export function clinicalLeaf(label: string, value: number | string, unit?: string): ClinicalNode { return engine.clinicalLeaf(label, value, unit); }
export function clinicalOperation(operation: ArithmeticOperation, left: ClinicalNode, right: ClinicalNode, label: string, unit?: string): ClinicalNode { return engine.clinicalOperation(operation, left, right, label, unit); }
