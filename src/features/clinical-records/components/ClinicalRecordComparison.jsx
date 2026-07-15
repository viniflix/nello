import React from 'react';
import { Badge } from '@/components/ui/badge';
import { compareSectionValues } from '../model/amendmentSchema';
import { getMeaningfulClinicalText } from '../model/evolutionSchema';

const CHANGE_LABELS = {
  unchanged: 'Sem alteração',
  added: 'Adicionado',
  removed: 'Removido',
  changed: 'Alterado',
};

const plainText = (value) => {
  if (typeof value === 'string') return getMeaningfulClinicalText(value);
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
};

const normalizeSections = (comparison) => {
  const snapshotSections = [
    comparison?.right?.template_sections_snapshot,
    comparison?.left?.template_sections_snapshot,
    comparison?.right_record?.template_sections_snapshot,
    comparison?.left_record?.template_sections_snapshot,
  ].filter(Array.isArray).flat();
  const snapshotLabels = Object.fromEntries(
    snapshotSections.map((section) => [section.key, section.label]),
  );
  const labels = { ...snapshotLabels, ...(comparison?.section_labels || {}) };
  if (Array.isArray(comparison?.sections)) {
    return comparison.sections.map((section) => ({
      ...section,
      label: section.label || labels[section.key] || section.key,
    }));
  }
  const leftContent = comparison?.left?.content || comparison?.left_content || {};
  const rightContent = comparison?.right?.content || comparison?.right_content || {};
  return [...new Set([...Object.keys(leftContent), ...Object.keys(rightContent)])].map((key) => ({
    key,
    label: labels[key] || key,
    left: leftContent[key],
    right: rightContent[key],
  }));
};

const ClinicalRecordComparison = ({ comparison }) => {
  const sections = normalizeSections(comparison);
  return (
    <section aria-labelledby="clinical-comparison-title" className="space-y-4">
      <h3 id="clinical-comparison-title" className="font-semibold">Comparação de versões</h3>
      {sections.map((section) => {
        const left = section.left ?? section.left_value;
        const right = section.right ?? section.right_value;
        const leftText = plainText(left);
        const rightText = plainText(right);
        const state = compareSectionValues(leftText, rightText);
        return (
          <article key={section.key || section.label} className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-medium">{section.label || section.key}</h4>
              <Badge variant="secondary">{CHANGE_LABELS[state]}</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Versão anterior</p>
                <p className="whitespace-pre-wrap text-sm">{leftText || 'Sem conteúdo'}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Versão posterior</p>
                <p className="whitespace-pre-wrap text-sm">{rightText || 'Sem conteúdo'}</p>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
};

export default ClinicalRecordComparison;
