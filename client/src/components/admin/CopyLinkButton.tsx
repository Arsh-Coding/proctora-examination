import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { copyToClipboard, examLinkFor } from '../../utils/examLink';
import { Button } from '../ui/Button';

export function CopyLinkButton({
  examId,
  size = 'md',
  variant = 'secondary',
  label = 'Copy Exam Link',
}: {
  examId: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost';
  label?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const link = examLinkFor(examId);
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopied(true);
      toast.success('Exam link copied', link);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Could not copy automatically', link);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={handleCopy}>
      {copied ? 'Copied' : label}
    </Button>
  );
}
