import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { listShiftDescriptionTemplates, saveShiftDescriptionTemplate, type ShiftDescriptionTemplateApi } from '@chemisttasker/shared-core';
type ShiftDescriptionTemplate = ShiftDescriptionTemplateApi;
interface DescriptionOptions {
  pharmacyId: number | ''; roleNeeded: string; editingShiftId: string | null;
  description: string; setDescription: Dispatch<SetStateAction<string>>;
  showSnackbar: (message: string, severity?: 'success' | 'error') => void;
}
/** Role-scoped template loading, cancellation and explicit reuse, independently of wizard rendering. */
export function useShiftDescriptionTemplate({ pharmacyId, roleNeeded, editingShiftId, description, setDescription, showSnackbar }: DescriptionOptions) {
  const [descriptionTemplate, setDescriptionTemplate] = useState<ShiftDescriptionTemplate | null>(null);
  const [descriptionTemplateLoading, setDescriptionTemplateLoading] = useState(false);
  const [descriptionTemplateSaving, setDescriptionTemplateSaving] = useState(false);
  const [descriptionTemplateAutoAppliedKey, setDescriptionTemplateAutoAppliedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!pharmacyId || !roleNeeded) {
      setDescriptionTemplate(null);
      setDescriptionTemplateAutoAppliedKey(null);
      return;
    }

    let cancelled = false;
    const templateKey = `${pharmacyId}:${roleNeeded}`;

    const loadDescriptionTemplate = async () => {
      setDescriptionTemplateLoading(true);
      try {
        const data = await listShiftDescriptionTemplates(Number(pharmacyId), roleNeeded);
        if (cancelled) {
          return;
        }
        const list = data;
        const template = (list[0] ?? null) as ShiftDescriptionTemplate | null;
        setDescriptionTemplate(template);
        if (
          template?.description &&
          !editingShiftId &&
          !description.trim() &&
          descriptionTemplateAutoAppliedKey !== templateKey
        ) {
          setDescription(template.description);
          setDescriptionTemplateAutoAppliedKey(templateKey);
        }
      } catch {
        if (!cancelled) {
          setDescriptionTemplate(null);
        }
      } finally {
        if (!cancelled) {
          setDescriptionTemplateLoading(false);
        }
      }
    };

    loadDescriptionTemplate();

    return () => {
      cancelled = true;
    };
  }, [pharmacyId, roleNeeded, editingShiftId, description, descriptionTemplateAutoAppliedKey]);

  const handleUseDescriptionTemplate = () => {
    if (!descriptionTemplate?.description) return;
    setDescription(descriptionTemplate.description);
  };

  const handleSaveDescriptionTemplate = async () => {
    if (!pharmacyId || !roleNeeded) {
      showSnackbar('Select a pharmacy and role before saving a description template', 'error');
      return;
    }
    if (!description.trim()) {
      showSnackbar('Enter a description before saving it as a template', 'error');
      return;
    }
    setDescriptionTemplateSaving(true);
    try {
      const data = await saveShiftDescriptionTemplate(Number(pharmacyId), roleNeeded, description);
      setDescriptionTemplate(data as ShiftDescriptionTemplate);
      setDescriptionTemplateAutoAppliedKey(`${pharmacyId}:${roleNeeded}`);
      showSnackbar('Description template saved for this role', 'success');
    } catch {
      showSnackbar('Unable to save description template', 'error');
    } finally {
      setDescriptionTemplateSaving(false);
    }
  };

  return { descriptionTemplate, descriptionTemplateLoading, descriptionTemplateSaving, handleUseDescriptionTemplate, handleSaveDescriptionTemplate };
}
