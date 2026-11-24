export function attendanceReviewStatus(record:{timeIn:unknown;timeOut:unknown;approvedBy?:unknown;remarks?:string|null;employee:{trackTime?:boolean}}){
 if(record.employee.trackTime===false)return 'NOT_REQUIRED' as const
 if(!record.timeIn||!record.timeOut)return 'IN_PROGRESS' as const
 if(record.approvedBy)return 'APPROVED' as const
 if(record.remarks==='REJECTED')return 'REJECTED' as const
 return 'PENDING' as const
}
export const completedTrackedSession={timeIn:{not:null},timeOut:{not:null},employee:{trackTime:true}} as const
