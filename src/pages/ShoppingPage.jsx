import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ShoppingDB, timeAgo } from '../lib/db'
import { Modal, EmptyState, PageHeader, useToast, confirmDelete, CalendarPicker, PageSpinner } from '../components/UI'
import { useRealtimeRefresh } from '../lib/realtime'
import { sendPushNotification } from '../lib/notifications'

const EMOJIS = ['🛒', '🥦', '🏠', '💊', '🎁', '🐾', '🍷', '🧹', '👕', '🎮', '🧴', '🍕']
const COLORS = ['#00BFA5', '#5B6AF0', '#FF5A5A', '#FF9500', '#9C6FFF', '#2196F3', '#34C759', '#FF6B9D']
const CATEGORIES = ['🥦 Produce', '🥩 Meat & Fish', '🥛 Dairy', '🍞 Bakery', '🧴 Hygiene', '🧹 Cleaning', '🍿 Snacks', '🥤 Drinks', '🧊 Frozen', '❓ General']

export function ShoppingListsPage() {
  const { user, householdId } = useAuth()
  const navigate = useNavigate()
  const [lists, setLists] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [listNotes, setListNotes] = useState('')
  const [emoji, setEmoji] = useState('🛒')
  const [color, setColor] = useState('#00BFA5')
  const [showToast, ToastEl] = useToast()

  const load = async () => {
    const ls = await ShoppingDB.getLists(householdId)
    setLists(ls)
    const allItems = await ShoppingDB.getAllItems(householdId)
    const c = {}
    ls.forEach(l => {
      const its = allItems.filter(i => i.list_id === l.id)
      c[l.id] = { total: its.length, checked: its.filter(i => i.checked).length }
    })
    setCounts(c)
    setLoading(false)
  }

  useEffect(() => { if (householdId) load() }, [householdId])

  // Realtime: כל שינוי ברשימות או בפריטים → רענון אוטומטי
  useRealtimeRefresh('shopping_lists', load)
  useRealtimeRefresh('shopping_items', load)

  const handleCreate = async () => {
    if (!name.trim()) return
    const list = await ShoppingDB.createList(householdId, user.id, name.trim(), emoji, color, listNotes.trim())
    setName(''); setListNotes(''); setEmoji('🛒'); setColor('#00BFA5')
    setShowModal(false)
    showToast('List created!')
    sendPushNotification({ householdId, userId: user.id, title: '🛒 רשימת קניות חדשה', body: name.trim(), url: `/shopping/${list.id}`, category: 'shopping' })
    navigate(`/shopping/${list.id}`)
  }

  const handleDelete = async (list) => {
    if (!confirmDelete(`Delete "${list.name}" and all its items?`)) return
    await ShoppingDB.deleteList(list.id)
    showToast('List deleted')
    load()
  }

  return (
    <div>
      <PageHeader title="Shopping" icon="🛒" accent="var(--teal)" subtitle={`${lists.length} list${lists.length !== 1 ? 's' : ''}`} action={() => setShowModal(true)} actionLabel="+ New List" actionColor="var(--teal)" />

      <div className="page" style={{ paddingTop: '20px' }}>
        {loading
          ? <PageSpinner />
          : lists.length === 0
          ? <EmptyState icon="🛒" title="No shopping lists yet" subtitle="Create a list for groceries, pharmacy, or anything else" action={() => setShowModal(true)} actionLabel="Create first list" />
          : lists.map(list => {
            const c = counts[list.id] || { total: 0, checked: 0 }
            const progress = c.total > 0 ? c.checked / c.total : 0
            return (
              <div key={list.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '16px', marginBottom: '10px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', position: 'relative' }}
                onClick={() => navigate(`/shopping/${list.id}`)}>
                <div style={{ width: 52, height: 52, borderRadius: '14px', background: list.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', flexShrink: 0 }}>
                  {list.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '3px' }}>{list.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                    {c.total === 0 ? 'Empty list' : `${c.checked}/${c.total} items`}
                  </div>
                  {list.notes?.trim() && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      📝 {list.notes.trim()}
                    </div>
                  )}
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: c.total > 0 ? '6px' : 0 }}>
                    Created {timeAgo(list.created_at)}
                  </div>
                  {c.total > 0 && (
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${progress * 100}%`, background: list.color }} />
                    </div>
                  )}
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(list) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', opacity: 0.4, padding: '4px' }}>🗑️</button>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', borderRadius: '3px 0 0 3px', background: list.color }} />
              </div>
            )
          })
        }
      </div>

      {ToastEl}

      <button
        type="button"
        className="fab"
        style={{ background: 'var(--teal)' }}
        aria-label="רשימת קניות חדשה"
        onClick={() => setShowModal(true)}
      >+</button>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Shopping List" onSubmit={handleCreate} submitLabel="Create List" submitColor="var(--teal)">
        <div className="input-group">
          <label className="input-label">List name</label>
          <input className="input" placeholder="e.g. Weekly Groceries" value={name} onChange={e => setName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleCreate()} />
        </div>
        <div className="input-group">
          <label className="input-label">Icon</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                style={{ width: 44, height: 44, borderRadius: '12px', border: `1.5px solid ${emoji === e ? color : 'var(--border)'}`, background: emoji === e ? color + '20' : 'var(--bg-elevated)', cursor: 'pointer', fontSize: '22px' }}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Color</label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: color === c ? '3px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer' }} />
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">הערה (אופציונלי)</label>
          <textarea className="input" rows={2} placeholder="למשל: לקנות רק במבצע, חנות ספציפית..." value={listNotes} onChange={e => setListNotes(e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}

export function ShoppingDetailPage() {
  const { user, householdId } = useAuth()
  const navigate = useNavigate()
  const { id: listId } = useParams()
  const [list, setList] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [itemName, setItemName] = useState('')
  const [itemNotes, setItemNotes] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('')
  const [category, setCategory] = useState('❓ General')
  const [editingItem, setEditingItem] = useState(null)
  const [showToast, ToastEl] = useToast()

  const load = async () => {
    const lists = await ShoppingDB.getLists(householdId)
    const found = lists.find(l => l.id === listId)
    setList(found)
    const its = await ShoppingDB.getItems(listId)
    setItems(its)
    setLoading(false)
  }

  useEffect(() => { if (householdId && listId) load() }, [householdId, listId])

  // Realtime: סנכרון מיידי בין אמא לאבא בזמן קניות
  useRealtimeRefresh('shopping_items', load, `list_id=eq.${listId}`)
  useRealtimeRefresh('shopping_lists', load)

  const handleAdd = async () => {
    if (!itemName.trim()) return
    if (editingItem) {
      await ShoppingDB.updateItem(editingItem.id, {
        name: itemName.trim(),
        qty: parseInt(qty) || 1,
        unit: unit.trim(),
        category,
        notes: itemNotes.trim(),
      })
      showToast('✓ עודכן')
      sendPushNotification({ householdId, userId: user.id, title: '🛒 עדכון ברשימת קניות', body: `${list?.name}: ${itemName.trim()} עודכן`, url: `/shopping/${listId}`, category: 'shopping' })
    } else {
      await ShoppingDB.addItem(listId, householdId, itemName.trim(), parseInt(qty) || 1, unit.trim(), category, itemNotes.trim())
      showToast('✓ נוסף')
      sendPushNotification({ householdId, userId: user.id, title: '🛒 פריט חדש ברשימה', body: `${list?.name}: ${itemName.trim()}`, url: `/shopping/${listId}`, category: 'shopping' })
    }
    setItemName(''); setItemNotes(''); setQty('1'); setUnit(''); setCategory('❓ General'); setEditingItem(null)
    setShowModal(false)
    load()
  }

  const handleEdit = (item) => {
    setEditingItem(item)
    setItemName(item.name)
    setItemNotes(item.notes || '')
    setQty(String(item.qty))
    setUnit(item.unit || '')
    setCategory(item.category)
    setShowModal(true)
  }

  const handleToggle = async (id, checked) => {
    await ShoppingDB.toggleItem(id, !checked)
    load()
  }

  const handleDelete = async (id, name) => {
    if (!confirmDelete(`Remove "${name}"?`)) return
    await ShoppingDB.deleteItem(id)
    load()
  }

  const handleClearChecked = async () => {
    const n = items.filter(i => i.checked).length
    if (!n) return
    if (!confirmDelete(`Clear ${n} checked item${n > 1 ? 's' : ''}?`)) return
    await ShoppingDB.clearChecked(listId)
    showToast(`${n} item${n > 1 ? 's' : ''} cleared!`)
    load()
  }

  const pending = items.filter(i => !i.checked)
  const checked = items.filter(i => i.checked)
  const color = list?.color || 'var(--teal)'
  const progress = items.length > 0 ? checked.length / items.length : 0

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '20px 20px 16px', paddingTop: 'max(20px, env(safe-area-inset-top))', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => navigate('/shopping')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '28px', color: 'var(--text-primary)', lineHeight: 1 }}>‹</button>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800 }}>{list?.emoji} {list?.name}</h1>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{checked.length}/{items.length} done</p>
              {list?.notes?.trim() && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>📝 {list.notes.trim()}</p>
              )}
            </div>
            {checked.length > 0 && (
              <button className="btn btn-sm btn-danger" onClick={handleClearChecked}>Clear done</button>
            )}
          </div>
          {items.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
              <div className="progress-track" style={{ flex: 1 }}>
                <div className="progress-fill" style={{ width: `${progress * 100}%`, background: color }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700 }}>{Math.round(progress * 100)}%</span>
            </div>
          )}
        </div>
      </div>

      <div className="page" style={{ paddingTop: '20px' }}>
        {loading
          ? <PageSpinner />
          : items.length === 0 && <EmptyState icon="📝" title="List is empty" subtitle="Tap + to add your first item" />
        }

        {pending.length > 0 && (
          <>
            <div className="section-label">To Get ({pending.length})</div>
            {pending.map(item => (
              <div key={item.id} className="list-item">
                <input type="checkbox" className="checkbox" checked={false} onChange={() => handleToggle(item.id, item.checked)} style={{ '--check-color': color }} />
                <div className="list-item-body">
                  <div className="list-item-title">{item.name}</div>
                  <div className="list-item-meta">{item.category}{(item.qty > 1 || item.unit) ? ` · ${item.qty}${item.unit ? ' ' + item.unit : ''}` : ''}</div>
                  {item.notes?.trim() && (
                    <div className="list-item-meta" style={{ marginTop: '4px', fontStyle: 'italic', color: 'var(--text-muted)' }}>📝 {item.notes.trim()}</div>
                  )}
                  <div className="list-item-created">Added {timeAgo(item.created_at)}</div>
                </div>
                <button onClick={() => handleEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', opacity: 0.5, padding: '4px' }}>✏️</button>
                <button onClick={() => handleDelete(item.id, item.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', opacity: 0.4, padding: '4px' }}>🗑️</button>
              </div>
            ))}
          </>
        )}

        {checked.length > 0 && (
          <>
            <div className="section-label">In Cart ({checked.length}) <span onClick={handleClearChecked} style={{ cursor: 'pointer' }}>Clear</span></div>
            {checked.map(item => (
              <div key={item.id} className="list-item done">
                <input type="checkbox" className="checkbox" checked={true} onChange={() => handleToggle(item.id, item.checked)} style={{ accentColor: color }} />
                <div className="list-item-body">
                  <div className="list-item-title">{item.name}</div>
                  <div className="list-item-meta">{item.category}</div>
                  {item.notes?.trim() && (
                    <div className="list-item-meta" style={{ marginTop: '4px', fontStyle: 'italic', color: 'var(--text-muted)' }}>📝 {item.notes.trim()}</div>
                  )}
                </div>
                <button onClick={() => handleEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', opacity: 0.5, padding: '4px' }}>✏️</button>
                <button onClick={() => handleDelete(item.id, item.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', opacity: 0.4, padding: '4px' }}>🗑️</button>
              </div>
            ))}
          </>
        )}
      </div>

      {ToastEl}

      <button className="fab" style={{ background: color }} onClick={() => {
        setEditingItem(null)
        setItemName('')
        setItemNotes('')
        setQty('1')
        setUnit('')
        setCategory('❓ General')
        setShowModal(true)
      }}>+</button>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditingItem(null); setItemName(''); setItemNotes(''); setQty('1'); setUnit(''); setCategory('❓ General') }} title={editingItem ? "ערוך פריט" : "הוסף פריט"} onSubmit={handleAdd} submitLabel={editingItem ? "שמור" : "הוסף"} submitColor={color}>
        <div className="input-group">
          <label className="input-label">Item name</label>
          <input className="input" placeholder="e.g. Milk, Bread..." value={itemName} onChange={e => setItemName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="input-group" style={{ flex: 1 }}>
            <label className="input-label">Qty</label>
            <input className="input" type="number" value={qty} onChange={e => setQty(e.target.value)} min="1" />
          </div>
          <div className="input-group" style={{ flex: 2 }}>
            <label className="input-label">Unit (optional)</label>
            <input className="input" placeholder="kg, L, pcs..." value={unit} onChange={e => setUnit(e.target.value)} />
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Category</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)}
                style={{ padding: '6px 12px', borderRadius: '999px', border: `1.5px solid ${category === cat ? color : 'var(--border)'}`, background: category === cat ? color + '20' : 'var(--bg-elevated)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: category === cat ? color : 'var(--text-secondary)' }}>
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">הערה (אופציונלי)</label>
          <textarea className="input" rows={2} placeholder="למשל: מותג מועדף, גודל, כשרות..." value={itemNotes} onChange={e => setItemNotes(e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}
