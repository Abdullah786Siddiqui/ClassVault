import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/semester/:semesterId',
      name: 'semester',
      component: () => import('../views/SemesterView.vue'),
    },
    {
      path: '/semester/:semesterId/:exam',
      name: 'subject-list',
      component: () => import('../views/SubjectListView.vue'),
    },
    {
      path: '/semester/:semesterId/:exam/subject/:subjectId',
      name: 'subject',
      component: () => import('../views/SubjectView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
