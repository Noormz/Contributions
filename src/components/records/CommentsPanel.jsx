import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageSquare, Send } from 'lucide-react';

export default function CommentsPanel({ entityName, recordId }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.entities.RecordComment.filter(
        { entity_name: entityName, record_id: recordId },
        { sort: '-created_date', limit: 50 }
      );
      setComments(res.items || []);
    } catch (e) {
      setComments([]);
    }
    setLoading(false);
  }, [entityName, recordId]);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!body.trim()) return;
    setPosting(true);
    try {
      await base44.entities.RecordComment.create({
        entity_name: entityName,
        record_id: recordId,
        body: body.trim(),
        author_name: user?.full_name || user?.email || '',
      });
      setBody('');
      await load();
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Textarea
          rows={3}
          placeholder={t('rec_add_comment')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={posting || !body.trim()} onClick={post} className="gap-1.5">
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t('rec_post')}
          </Button>
        </div>
      </div>
      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></p>
      ) : comments.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4 opacity-50" /> {t('rec_no_comments')}
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{c.author_name || '—'}</span>
                <span className="text-xs text-muted-foreground">
                  {c.created_date ? new Date(c.created_date).toLocaleString('en-GB') : ''}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}