import React, { useState } from 'react';
import { useAdminTheme } from '../AdminThemeContext';
import { CategoryBadge, DocumentCategory } from './CategoryBadge';

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Document {
  id: number;
  title: string;
  category: DocumentCategory;
  folderId: number | null;
  sourceType: string;
  mimeType?: string;
  size?: number;
  createdAt: string;
  tags: Tag[];
}

const MAX_SELECTION = 20;

interface DocumentListProps {
  documents: Document[];
  allTags: Tag[];
  onDeleteDocument: (doc: Document) => void;
  onMoveDocument: (doc: Document) => void;
  onChangeCategory: (doc: Document, category: DocumentCategory) => void;
  onEditTags: (doc: Document) => void;
  // Multi-select bulk operations
  onBulkCategoryAssign?: (docIds: number[], category: DocumentCategory) => void;
  onBulkDelete?: (docIds: number[]) => void;
}

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  allTags,
  onDeleteDocument,
  onMoveDocument,
  onChangeCategory,
  onEditTags,
  onBulkCategoryAssign,
  onBulkDelete,
}) => {
  const { colors } = useAdminTheme();
  const [sortBy, setSortBy] = useState<'title' | 'createdAt' | 'size'>('title');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);

  const toggleSelection = (docId: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(docId)) {
      newSet.delete(docId);
    } else {
      if (newSet.size >= MAX_SELECTION) {
        alert(`You can select up to ${MAX_SELECTION} documents at a time.`);
        return;
      }
      newSet.add(docId);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    const docIds = sortedDocs.slice(0, MAX_SELECTION).map(d => d.id);
    setSelectedIds(new Set(docIds));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkCategoryApply = (category: DocumentCategory) => {
    if (onBulkCategoryAssign && selectedIds.size > 0) {
      onBulkCategoryAssign(Array.from(selectedIds), category);
      setShowBulkCategoryModal(false);
      clearSelection();
    }
  };

  const sortedDocs = [...documents].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'title') {
      cmp = a.title.localeCompare(b.title);
    } else if (sortBy === 'createdAt') {
      cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    } else if (sortBy === 'size') {
      cmp = (a.size || 0) - (b.size || 0);
    }
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (col: 'title' | 'createdAt' | 'size') => {
    if (sortBy === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(col);
      setSortAsc(true);
    }
  };

  const SortIcon = ({ active, asc }: { active: boolean; asc: boolean }) => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{
        opacity: active ? 1 : 0.3,
        transform: active && !asc ? 'rotate(180deg)' : 'none',
      }}
    >
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  );

  if (documents.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
          color: colors.textSecondary,
          gap: 12,
        }}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <p style={{ fontSize: 14, margin: 0 }}>No documents in this folder</p>
        <p style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>Upload files to get started</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 12px',
            backgroundColor: colors.primary + '15',
            borderRadius: 8,
            marginBottom: 12,
            border: `1px solid ${colors.primary}40`,
          }}
        >
          <span style={{ fontSize: 13, color: colors.text, fontWeight: 500 }}>
            {selectedIds.size} selected {selectedIds.size === MAX_SELECTION && `(max ${MAX_SELECTION})`}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowBulkCategoryModal(true)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              background: colors.primary,
              color: '#fff',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            Set Category
          </button>
          {onBulkDelete && (
            <button
              onClick={() => {
                if (confirm(`Delete ${selectedIds.size} documents? This cannot be undone.`)) {
                  onBulkDelete(Array.from(selectedIds));
                  clearSelection();
                }
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: `1px solid ${colors.error}`,
                background: 'transparent',
                color: colors.error,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Delete
            </button>
          )}
          <button
            onClick={clearSelection}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: `1px solid ${colors.border}`,
              background: colors.bgCard,
              color: colors.text,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Bulk Category Assignment Modal */}
      {showBulkCategoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowBulkCategoryModal(false)}
        >
          <div
            style={{
              background: colors.bgCard,
              borderRadius: 12,
              padding: 24,
              width: 320,
              boxShadow: colors.shadowLg,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', color: colors.text, fontSize: 16 }}>
              Set Category for {selectedIds.size} Documents
            </h3>
            <p style={{ fontSize: 12, color: colors.textSecondary, margin: '0 0 16px' }}>
              Choose a category to apply to all selected documents.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {(['knowledge', 'code', 'data'] as DocumentCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleBulkCategoryApply(cat)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    borderRadius: 8,
                    backgroundColor: colors.bgSecondary,
                    border: `1px solid ${colors.border}`,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.bgHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = colors.bgSecondary)}
                >
                  <CategoryBadge category={cat} />
                  <span style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 'auto' }}>
                    Click to apply
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowBulkCategoryModal(false)}
              style={{
                width: '100%',
                padding: '8px 16px',
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                background: colors.bgCard,
                color: colors.text,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            {/* Checkbox column */}
            <th style={{ width: 40, padding: '10px 8px' }}>
              <input
                type="checkbox"
                checked={selectedIds.size > 0 && selectedIds.size === Math.min(documents.length, MAX_SELECTION)}
                onChange={() => {
                  if (selectedIds.size > 0) {
                    clearSelection();
                  } else {
                    selectAll();
                  }
                }}
                style={{ cursor: 'pointer', accentColor: colors.primary }}
                title={selectedIds.size > 0 ? 'Clear selection' : `Select up to ${MAX_SELECTION}`}
              />
            </th>
            <th
              onClick={() => handleSort('title')}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                color: colors.textSecondary,
                fontWeight: 500,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Name
                <SortIcon active={sortBy === 'title'} asc={sortAsc} />
              </span>
            </th>
            <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.textSecondary, fontWeight: 500 }}>
              Category
            </th>
            <th style={{ textAlign: 'left', padding: '10px 12px', color: colors.textSecondary, fontWeight: 500 }}>
              Tags
            </th>
            <th
              onClick={() => handleSort('size')}
              style={{
                textAlign: 'right',
                padding: '10px 12px',
                color: colors.textSecondary,
                fontWeight: 500,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                Size
                <SortIcon active={sortBy === 'size'} asc={sortAsc} />
              </span>
            </th>
            <th
              onClick={() => handleSort('createdAt')}
              style={{
                textAlign: 'right',
                padding: '10px 12px',
                color: colors.textSecondary,
                fontWeight: 500,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                Added
                <SortIcon active={sortBy === 'createdAt'} asc={sortAsc} />
              </span>
            </th>
            <th style={{ width: 80, padding: '10px 12px' }}></th>
          </tr>
        </thead>
        <tbody>
          {sortedDocs.map((doc) => {
            const isSelected = selectedIds.has(doc.id);
            return (
            <tr
              key={doc.id}
              style={{
                borderBottom: `1px solid ${colors.border}`,
                backgroundColor: isSelected
                  ? `${colors.primary}15`
                  : expandedRow === doc.id
                  ? colors.bgSecondary
                  : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (expandedRow !== doc.id && !isSelected) e.currentTarget.style.backgroundColor = colors.bgHover;
              }}
              onMouseLeave={(e) => {
                if (expandedRow !== doc.id && !isSelected) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {/* Checkbox cell */}
              <td style={{ padding: '10px 8px', width: 40 }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelection(doc.id)}
                  style={{ cursor: 'pointer', accentColor: colors.primary }}
                />
              </td>
              <td style={{ padding: '10px 12px', color: colors.text }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* File Icon */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ color: colors.textSecondary, flexShrink: 0 }}
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.title}
                  </span>
                </div>
              </td>
              <td style={{ padding: '10px 12px' }}>
                <CategoryBadge category={doc.category} />
              </td>
              <td style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {doc.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag.id}
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 10,
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                        border: `1px solid ${tag.color}40`,
                      }}
                    >
                      {tag.name}
                    </span>
                  ))}
                  {doc.tags.length > 3 && (
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 10,
                        backgroundColor: colors.bgSecondary,
                        color: colors.textSecondary,
                      }}
                    >
                      +{doc.tags.length - 3}
                    </span>
                  )}
                  {doc.tags.length === 0 && (
                    <span style={{ fontSize: 11, color: colors.textSecondary, fontStyle: 'italic' }}>No tags</span>
                  )}
                </div>
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: colors.textSecondary, fontSize: 12 }}>
                {formatFileSize(doc.size)}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: colors.textSecondary, fontSize: 12 }}>
                {formatDate(doc.createdAt)}
              </td>
              <td style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                  <button
                    onClick={() => setExpandedRow(expandedRow === doc.id ? null : doc.id)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: `1px solid ${colors.border}`,
                      background: colors.bgCard,
                      color: colors.text,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                    title="More actions"
                  >
                    ...
                  </button>
                  <button
                    onClick={() => onDeleteDocument(doc)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: `1px solid ${colors.border}`,
                      background: colors.bgCard,
                      color: colors.error,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                    title="Delete"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>

                {/* Expanded Actions Row */}
                {expandedRow === doc.id && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 12,
                      marginTop: 4,
                      padding: 8,
                      backgroundColor: colors.bgCard,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 8,
                      boxShadow: colors.shadowLg,
                      zIndex: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      minWidth: 140,
                    }}
                  >
                    <button
                      onClick={() => {
                        onMoveDocument(doc);
                        setExpandedRow(null);
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 4,
                        border: 'none',
                        background: 'transparent',
                        color: colors.text,
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.bgSecondary)}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                      Move to folder
                    </button>
                    <button
                      onClick={() => {
                        onEditTags(doc);
                        setExpandedRow(null);
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 4,
                        border: 'none',
                        background: 'transparent',
                        color: colors.text,
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.bgSecondary)}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                        <line x1="7" y1="7" x2="7.01" y2="7"></line>
                      </svg>
                      Edit tags
                    </button>
                    <div style={{ borderTop: `1px solid ${colors.border}`, margin: '4px 0' }} />
                    <div style={{ padding: '4px 10px', fontSize: 11, color: colors.textSecondary }}>Category:</div>
                    {(['knowledge', 'code', 'data'] as DocumentCategory[]).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          onChangeCategory(doc, cat);
                          setExpandedRow(null);
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 4,
                          border: 'none',
                          background: doc.category === cat ? colors.bgSecondary : 'transparent',
                          color: colors.text,
                          fontSize: 12,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.bgSecondary)}
                        onMouseLeave={(e) => {
                          if (doc.category !== cat) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <CategoryBadge category={cat} size="sm" />
                      </button>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default DocumentList;
