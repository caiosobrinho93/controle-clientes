import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key && !url.includes('seu-projeto'))
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null

export type Contact = {
  id: string
  name: string
  phone: string
  email: string
  address: string
  notes: string
  created_at: string
}

export type Product = {
  id: string
  name: string
  unit: string
  cost_price: number
  is_active: boolean
  created_at: string
}

export type QuoteItem = {
  productId?: string
  description: string
  unit: string
  quantity: number
  unitCost: number
  unitPrice: number
}
export type Quote = {
  id: string
  contact_id: string | null
  number: string
  title: string
  status: 'pending' | 'approved' | 'rejected'
  items: QuoteItem[]
  cost_subtotal: number
  multiplier: number
  subtotal: number
  discount: number
  total: number
  valid_until: string | null
  delivery_estimate: string
  payment_terms: string
  notes: string
  created_at: string
  signed_at: string | null
  signed_by: string | null
  signature_data: string | null
  signed_document_hash: string | null
  contacts?: Pick<Contact, 'name' | 'phone' | 'email' | 'address'> | null
}
