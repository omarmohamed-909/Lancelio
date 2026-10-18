// Static application code, executed in the head before page content can paint.
export const themeScript = `(()=>{let p='system';try{const v=localStorage.getItem('lancelio:theme:v1');if(v==='light'||v==='dark')p=v}catch{}document.documentElement.dataset.theme=(p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))?'dark':'light'})()`;
