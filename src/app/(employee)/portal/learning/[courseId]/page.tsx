import {CoursePlayerClient} from '@/components/learning/CoursePlayerClient'
export default async function CoursePlayerPage({params}:{params:Promise<{courseId:string}>}){const{courseId}=await params;return <CoursePlayerClient courseId={courseId}/>}
