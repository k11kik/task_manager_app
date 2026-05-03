export type Category = 'Urgent' | 'Focus' | 'Archive' | 'Trash';

export interface Task {
  id: string;
  userId: string;
  title: string;
  project: string;
  category: Category;
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
  isDone: boolean;
  notes?: string;
}

export interface TaskHistory {
  taskId: string;
  action: string;
  timestamp: number;
}
