import {CourseBuilderClient} from '@/components/learning/CourseBuilderClient'
export default async function CourseBuilderPage({params}:{params:Promise<{courseId:string}>}){const{courseId}=await params;return <CourseBuilderClient courseId={courseId}/>}
