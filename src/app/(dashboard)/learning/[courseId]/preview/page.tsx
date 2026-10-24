import { CoursePreviewClient } from '@/components/learning/CoursePreviewClient'

export default async function CoursePreviewPage({params}:{params:Promise<{courseId:string}>}){
 const{courseId}=await params
 return <CoursePreviewClient courseId={courseId}/>
}
