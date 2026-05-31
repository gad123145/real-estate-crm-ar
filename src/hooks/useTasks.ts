import { useEffect, useState } from 'react'
import type { Appointment, DemandClient, PropertyOwner } from '../App'

export interface Task {
  id: string
  title: string
  description: string
  dueDate: string
  status: 'pending' | 'completed' | 'overdue'
  priority: 'low' | 'medium' | 'high'
  linkedType: 'owner' | 'seeker' | 'appointment' | 'general'
  linkedId: string
  createdAt: string
}

const TASKS_STORAGE_KEY = 'real-estate-crm-tasks'

function readTasks(): Task[] {
  try {
    const stored = localStorage.getItem(TASKS_STORAGE_KEY)
    return stored ? (JSON.parse(stored) as Task[]) : []
  } catch {
    return []
  }
}

function saveTasks(tasks: Task[]) {
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(readTasks)

  useEffect(() => {
    saveTasks(tasks)
  }, [tasks])

  const addTask = (task: Omit<Task, 'id' | 'createdAt'>) => {
    const newTask: Task = {
      ...task,
      id: `${Date.now()}-${Math.random()}`,
      createdAt: new Date().toISOString(),
    }
    setTasks((current) => [newTask, ...current])
    return newTask
  }

  const updateTask = (id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, ...updates } : task))
    )
  }

  const deleteTask = (id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id))
  }

  const toggleTaskStatus = (id: string) => {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== id) return task
        const nextStatus = task.status === 'completed' ? 'pending' : 'completed'
        return { ...task, status: nextStatus }
      })
    )
  }

  const overdueTasks = tasks.filter((task) => {
    if (task.status === 'completed') return false
    return new Date(task.dueDate).getTime() < Date.now()
  })

  const pendingTasks = tasks.filter((task) => task.status === 'pending')
  const completedTasks = tasks.filter((task) => task.status === 'completed')

  return {
    tasks,
    pendingTasks,
    completedTasks,
    overdueTasks,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskStatus,
  }
}

export function getTaskLinkLabel(
  task: Task,
  owners: PropertyOwner[],
  seekers: DemandClient[],
  appointments: Appointment[]
) {
  if (task.linkedType === 'general') return ''
  if (task.linkedType === 'owner') {
    const owner = owners.find((o) => o.id === task.linkedId)
    return owner ? `عقار: ${owner.ownerName || owner.propertyType}` : ''
  }
  if (task.linkedType === 'seeker') {
    const seeker = seekers.find((s) => s.id === task.linkedId)
    return seeker ? `عميل: ${seeker.name}` : ''
  }
  const appointment = appointments.find((a) => a.id === task.linkedId)
  return appointment ? `موعد: ${appointment.title || appointment.appointmentType}` : ''
}
