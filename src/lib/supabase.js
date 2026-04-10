import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wzllrjbumbxvvozcwlzj.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bGxyamJ1bWJ4dnZvemN3bHpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzAyNDYsImV4cCI6MjA5MTM0NjI0Nn0.Nz0WtZuAbx6car3LqekRnsfvosjLKxCm7zUx-dUl_Bk'

export const supabase = createClient(supabaseUrl, supabaseKey)
