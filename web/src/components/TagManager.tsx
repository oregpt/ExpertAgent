import React, { useState } from 'react';
import { useAdminTheme } from '../AdminThemeContext';

export interface Tag {
  id: number;
  name: string;
  color: string;
  documentCount?: number;
}

interface TagManagerProps {
  isOpen: boolean;
  onClose: () => void;
  tags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<void>;
  onUpdateTag: (tagId: number, name: string, color: string) => Promise<void>;
  onDeleteTag: (tagId: number) => Promise<void>;
}

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#6b7280', // gray
];

export const TagManager: React.FC<TagManagerProps> = ({
  isOpen,
  onClose,
  tags,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}) => {
  const { colors } = useAdminTheme();
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!newTagName.trim()) {
      setError('Tag name is required');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await onCreateTag(newTagName.trim(), newTagColor);
      setNewTagName('');
      setNewTagColor('#3b82f6');
    } catch (err: any) {
      setError(err.message || 'Failed to create tag');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingTag) return;
    setError('');
    setIsLoading(true);
    try {
      await onUpdateTag(editingTag.id, editingTag.name, editingTag.color);
      setEditingTag(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update tag');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (tagId: number) => {
    if (!confirm('Are you sure you want to delete this tag?')) return;
    setError('');
    setIsLoading(true);
    try {
      await onDeleteTag(tagId);
    } catch (err: any) {
      setError(err.message || 'Failed to delete tag');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: colors.bgCard,
          borderRadius: 12,
          padding: 24,
          width: 400,
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: colors.shadowLg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: colors.text }}>Manage Tags</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: colors.textSecondary,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: '8px 12px',
              marginBottom: 12,
              borderRadius: 6,
              backgroundColor: `${colors.error}15`,
              color: colors.error,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Create New Tag */}
        <div style={{ marginBottom: 16, padding: 12, backgroundColor: colors.bgSecondary, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>Create New Tag</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name"
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bgInput,
                color: colors.text,
                fontSize: 13,
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              style={{
                width: 36,
                height: 36,
                padding: 0,
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                cursor: 'pointer',
              }}
            />
            <button
              onClick={handleCreate}
              disabled={isLoading || !newTagName.trim()}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: colors.primary,
                color: '#fff',
                fontSize: 13,
                fontWeight: 500,
                cursor: isLoading || !newTagName.trim() ? 'not-allowed' : 'pointer',
                opacity: isLoading || !newTagName.trim() ? 0.5 : 1,
              }}
            >
              Add
            </button>
          </div>
          {/* Color Presets */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setNewTagColor(color)}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: newTagColor === color ? '2px solid white' : 'none',
                  backgroundColor: color,
                  cursor: 'pointer',
                  boxShadow: newTagColor === color ? `0 0 0 2px ${color}` : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Tag List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tags.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: colors.textSecondary, fontSize: 13 }}>
              No tags created yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    backgroundColor: colors.bgSecondary,
                    borderRadius: 6,
                  }}
                >
                  {editingTag?.id === tag.id ? (
                    <>
                      <input
                        type="text"
                        value={editingTag.name}
                        onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: 4,
                          border: `1px solid ${colors.border}`,
                          backgroundColor: colors.bgInput,
                          color: colors.text,
                          fontSize: 13,
                        }}
                      />
                      <input
                        type="color"
                        value={editingTag.color}
                        onChange={(e) => setEditingTag({ ...editingTag, color: e.target.value })}
                        style={{
                          width: 28,
                          height: 28,
                          padding: 0,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      />
                      <button
                        onClick={handleUpdate}
                        disabled={isLoading}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: 'none',
                          backgroundColor: colors.success,
                          color: '#fff',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingTag(null)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: `1px solid ${colors.border}`,
                          backgroundColor: colors.bgCard,
                          color: colors.text,
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: tag.color,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1, color: colors.text, fontSize: 13 }}>{tag.name}</span>
                      {tag.documentCount !== undefined && (
                        <span style={{ color: colors.textSecondary, fontSize: 11 }}>
                          {tag.documentCount} doc{tag.documentCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      <button
                        onClick={() => setEditingTag(tag)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: `1px solid ${colors.border}`,
                          backgroundColor: colors.bgCard,
                          color: colors.text,
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(tag.id)}
                        disabled={isLoading}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: `1px solid ${colors.border}`,
                          backgroundColor: colors.bgCard,
                          color: colors.error,
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TagManager;
