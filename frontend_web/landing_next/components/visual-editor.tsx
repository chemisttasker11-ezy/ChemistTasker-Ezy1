'use client';
import { useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Bold, Italic, List, ListOrdered, Heading2, Undo2, Redo2 } from 'lucide-react';
import type { RichNode } from './rich-content';
import { contentApi } from '@/lib/browser-api';
export default function VisualEditor({value,onChange,disabled=false}:{value:RichNode;onChange:(value:RichNode)=>void;disabled?:boolean}) {
 const [link,setLink]=useState(''); const [alt,setAlt]=useState('');const [error,setError]=useState('');const [uploading,setUploading]=useState(false);
 const editor=useEditor({extensions:[StarterKit.configure({heading:{levels:[2,3,4]},codeBlock:false,horizontalRule:false,link:{openOnClick:false}}),Image.configure({allowBase64:false})],
  content:value,immediatelyRender:false,editable:!disabled,editorProps:{attributes:{'aria-label':'Article body','role':'textbox','aria-multiline':'true'}},onUpdate:({editor})=>onChange(editor.getJSON() as RichNode)});
 async function upload(file?:File) {
  if(!file||!editor)return;setUploading(true);setError('');
  try {if(!alt.trim())throw new Error('Enter image alt text before uploading.');const form=new FormData();form.set('file',file);const result=await contentApi<{url:string}>('media/','POST',form);editor.chain().focus().setImage({src:result.url,alt}).run();}
  catch(e){setError((e as Error).message);}finally{setUploading(false);}
 }
 if(!editor)return <p role="status">Loading editor…</p>;
 const controls=[{label:'Bold',icon:Bold,active:editor.isActive('bold'),run:()=>editor.chain().focus().toggleBold().run()},
 {label:'Italic',icon:Italic,active:editor.isActive('italic'),run:()=>editor.chain().focus().toggleItalic().run()},
 {label:'Heading',icon:Heading2,active:editor.isActive('heading'),run:()=>editor.chain().focus().toggleHeading({level:2}).run()},
 {label:'Bullet list',icon:List,active:editor.isActive('bulletList'),run:()=>editor.chain().focus().toggleBulletList().run()},
 {label:'Numbered list',icon:ListOrdered,active:editor.isActive('orderedList'),run:()=>editor.chain().focus().toggleOrderedList().run()},
 {label:'Undo',icon:Undo2,run:()=>editor.chain().focus().undo().run()}, {label:'Redo',icon:Redo2,run:()=>editor.chain().focus().redo().run()}];
 return <div className="ct-editor"><div className="ct-toolbar" role="toolbar" aria-label="Text formatting">{controls.map(c=><button type="button" key={c.label} aria-label={c.label} title={c.label} aria-pressed={c.active} disabled={disabled} onClick={c.run}><c.icon size={18}/></button>)}</div>
 <EditorContent editor={editor}/><details><summary>Links and images</summary><div className="ct-form-grid"><label>Link URL<input type="url" value={link} onChange={e=>setLink(e.target.value)} placeholder="https://"/></label><button type="button" disabled={disabled} onClick={()=>{try{const parsed=new URL(link);if(!['https:','http:','mailto:'].includes(parsed.protocol))throw Error();editor.chain().focus().extendMarkRange('link').setLink({href:link}).run();setError('');}catch{setError('Enter a valid web or email link.');}}}>Apply link to selection</button><button type="button" disabled={disabled} onClick={()=>editor.chain().focus().unsetLink().run()}>Remove link</button><label>Image description<input value={alt} onChange={e=>setAlt(e.target.value)} maxLength={240}/></label><label>Upload image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled||uploading} onChange={e=>void upload(e.target.files?.[0])}/></label></div>{uploading&&<p role="status">Uploading image…</p>}{error&&<p role="alert">{error}</p>}</details></div>;
}
