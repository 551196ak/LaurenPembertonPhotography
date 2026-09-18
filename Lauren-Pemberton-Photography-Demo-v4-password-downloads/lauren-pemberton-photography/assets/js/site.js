const box=document.querySelector('.lightbox');
if(box){
  const boxImg=box.querySelector('img');
  const downloadBtn=box.querySelector('.download-photo');
  let currentImg=null;
  document.querySelectorAll('.masonry img,.photo-tile img').forEach(img=>img.addEventListener('click',()=>{
    currentImg=img; boxImg.src=img.src; boxImg.alt=img.alt; box.classList.add('open');
  }));
  box.addEventListener('click',e=>{if(e.target===box||e.target.classList.contains('close')) box.classList.remove('open')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape') box.classList.remove('open')});
  if(downloadBtn){
    downloadBtn.addEventListener('click',async()=>{
      if(!currentImg) return;
      const gallery=document.body.dataset.gallery;
      const file=currentImg.src.split('/').pop().split('?')[0];
      const password=prompt('Enter the gallery download password:');
      if(password===null) return;
      downloadBtn.disabled=true; downloadBtn.textContent='Checking…';
      try{
        const res=await fetch('/api/download',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({gallery,file,password})});
        if(!res.ok){const d=await res.json().catch(()=>({})); alert(d.error||'Download could not be authorized.'); return;}
        const blob=await res.blob(); const a=document.createElement('a');
        a.href=URL.createObjectURL(blob); a.download=file; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      }catch{alert('Download could not be completed. Please try again.');}
      finally{downloadBtn.disabled=false;downloadBtn.textContent='Download';}
    });
  }
}
