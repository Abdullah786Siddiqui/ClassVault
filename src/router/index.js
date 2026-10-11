import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import SemesterView from '../views/SemesterView.vue'
import SubjectListView from '../views/SubjectListView.vue'
import SubjectView from '../views/SubjectView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/semester/:semesterId',
      name: 'semester',
      component: SemesterView,
    },
    {
      path: '/semester/:semesterId/:exam',
      name: 'subject-list',
      component: SubjectListView,
    },
    {
      path: '/semester/:semesterId/:exam/subject/:subjectId',
      name: 'subject',
      component: SubjectView,
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
