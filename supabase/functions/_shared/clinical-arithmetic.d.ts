/** Exact shared engine's boundary. Runtime validation stays in clinical-arithmetic.js. */
export interface ClinicalFraction { numerator: string; denominator: string; }
export type ArithmeticOperation = 'add' | 'subtract' | 'multiply' | 'divide';
export interface ClinicalNode { operation: string; label: string; value: number; unit: string; exact: ClinicalFraction; operands?: ClinicalNode[]; }
export function decimalFraction(value: number | string): ClinicalFraction;
export function exactOperation(operation: ArithmeticOperation, operands: [ClinicalFraction, ClinicalFraction]): ClinicalFraction;
export function fractionNumber(value: ClinicalFraction): number;
export function roundClinicalFraction(value: ClinicalFraction, places?: number): string;
export function clinicalLeaf(label: string, value: number | string, unit?: string): ClinicalNode;
export function clinicalOperation(operation: ArithmeticOperation, left: ClinicalNode, right: ClinicalNode, label: string, unit?: string): ClinicalNode;
