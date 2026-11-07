import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MoreVertical, Eye, Pencil, Trash2 } from 'lucide-react';

/**
 * Row action menu: View / Edit / Delete — only authorized actions are shown.
 * Used by list tables; delete navigates nowhere (list refreshes via onDelete).
 */
export default function RecordActionsMenu({ entityName, record, onDelete }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const detailPath = `/records/${entityName}/${record.id}`;
  const canDelete =
    user?.role === 'system_admin' ||
    (record.created_by_id === user?.id && ['draft', 'returned', 'open'].includes(record.status));

  const doDelete = async () => {
    setDeleting(true);
    try {
      await base44.entities[entityName].delete(record.id);
      setConfirmOpen(false);
      if (onDelete) onDelete();
      else navigate('/', { replace: true });
    } catch (e) {
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('actions')}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem asChild>
            <Link to={detailPath} className="flex items-center gap-2 cursor-pointer">
              <Eye className="h-4 w-4" /> {t('view')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(`${detailPath}?edit=1`)} className="cursor-pointer">
            <Pencil className="h-4 w-4" /> {t('edit')}
          </DropdownMenuItem>
          {canDelete && (
            <DropdownMenuItem
              onSelect={() => setConfirmOpen(true)}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> {t('delete')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rec_delete_title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('rec_delete_msg')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>{t('cancel')}</Button>
            <Button variant="destructive" disabled={deleting} onClick={doDelete}>
              {deleting ? <Trash2 className="h-4 w-4 animate-pulse" /> : t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}