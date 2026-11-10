/* CC0 public two-slot mixer + real SB16 DMA1/IRQ7 probe. No game code.
   1=BGM, 2=SE, 3=both; 4/5/6=same with ONLY BGM addition excluded.
   Both source cursors advance identically. Q exits. 500Hz/1000Hz synthetic.
   GNU as --32; ld -m elf_i386 -Ttext 0x100 --oformat binary. */
.code16
.intel_syntax noprefix
.global _start
_start:
 push cs
 pop ds
 cld
ready_loop:
 mov dx,offset ready
 mov ah,9
 int 0x21
 xor ah,ah
 int 0x16
 cmp al,'q'
 je quit
 sub al,'1'
 cmp al,5
 ja ready_loop
 mov byte ptr [suppress],0
 cmp al,3
 jb normal
 mov byte ptr [suppress],1
 sub al,3
normal:
 mov ah,1
 cmp al,0
 je mask_done
 inc ah
 cmp al,1
 je mask_done
 inc ah
mask_done:
 mov [sources],ah
 mov dx,offset begin
 mov ah,9
 int 0x21
 mov word ptr [bgm_count],0
 mov word ptr [se_count],0
 mov word ptr [irq_count],0
 /* DMA buffer at a physical 64KiB boundary within this COM allocation. */
 mov ax,cs
 add ax,0x1000
 and ax,0xf000
 mov es,ax
 xor di,di
 xor si,si
 mov cx,8000
mix:
 xor dx,dx
 test byte ptr [sources],1
 jz se
 mov bx,si
 and bx,15
 mov al,[bgm+bx]
 cbw
 cmp byte ptr [suppress],0
 jne advance_bgm
 add dx,ax
advance_bgm:
 inc word ptr [bgm_count]
se:
 test byte ptr [sources],2
 jz store
 mov bx,si
 and bx,7
 mov al,[effect+bx]
 cbw
 add dx,ax
 inc word ptr [se_count]
store:
 mov ax,dx
 add al,128
 stosb
 inc si
 loop mix
 /* Install a real acknowledgement/counting IRQ7 handler. */
 mov ax,0x350f
 int 0x21
 mov [oldoff],bx
 mov [oldseg],es
 mov dx,offset irq
 mov ax,0x250f
 int 0x21
 in al,0x21
 mov [oldmask],al
 and al,0x7f
 out 0x21,al
 mov ax,cs
 add ax,0x1000
 and ax,0xf000
 mov es,ax
 mov dx,0x226
 mov al,1
 out dx,al
 mov cx,1000
reset_wait: loop reset_wait
 xor al,al
 out dx,al
 mov dx,0x22e
reset_ready:
 in al,dx
 test al,0x80
 jz reset_ready
 mov dx,0x22a
 in al,dx
 cmp al,0xaa
 jne quit
 mov al,0xd1
 call dsp
 mov al,0x41
 call dsp
 mov al,0x1f
 call dsp
 mov al,0x40
 call dsp
 mov al,5
 out 0x0a,al
 xor al,al
 out 0x0c,al
 mov al,0x49
 out 0x0b,al
 xor al,al
 out 2,al
 out 2,al
 mov ax,es
 mov cl,12
 shr ax,cl
 out 0x83,al
 mov ax,7999
 out 3,al
 mov al,ah
 out 3,al
 mov al,1
 out 0x0a,al
 mov al,0xc0
 call dsp
 xor al,al
 call dsp
 mov al,0x3f
 call dsp
 mov al,0x1f
 call dsp
 mov ax,0x40
 mov es,ax
 mov bp,word ptr es:[0x6c]
wait_ticks:
 mov ax,word ptr es:[0x6c]
 sub ax,bp
 cmp ax,30
 jb wait_ticks
 mov [elapsed],ax
 xor al,al
 out 0x0c,al
 in al,3
 mov bl,al
 in al,3
 mov bh,al
 mov [dma_count],bx
 mov al,0xd3
 call dsp
 cli
 mov al,[oldmask]
 out 0x21,al
 sti
 push ds
 mov dx,[oldoff]
 mov ds,[oldseg]
 mov ax,0x250f
 int 0x21
 pop ds
 mov dx,offset state
 mov ah,9
 int 0x21
 mov ax,[bgm_count]
 call hex
 mov ax,[se_count]
 call hex
 mov ax,[irq_count]
 call hex
 mov ax,[dma_count]
 call hex
 mov ax,[elapsed]
 call hex
 mov dx,offset done
 mov ah,9
 int 0x21
 jmp ready_loop
quit:
 mov ax,0x4c00
 int 0x21
dsp:
 push ax
 mov dx,0x22c
dsp_wait:
 in al,dx
 test al,0x80
 jnz dsp_wait
 pop ax
 out dx,al
 ret
irq:
 push ax
 push dx
 inc word ptr cs:[irq_count]
 mov dx,0x22e
 in al,dx
 mov al,0x20
 out 0x20,al
 pop dx
 pop ax
 iret
hex:
 push bx
 push cx
 mov bx,ax
 mov cx,4
hex_loop:
 rol bx,4
 mov dl,bl
 and dl,15
 add dl,'0'
 cmp dl,'9'
 jbe hex_char
 add dl,7
hex_char:
 mov ah,2
 int 0x21
 loop hex_loop
 mov dl,' '
 mov ah,2
 int 0x21
 pop cx
 pop bx
 ret
sources: .byte 0
suppress: .byte 0
oldmask: .byte 0
oldoff: .word 0
oldseg: .word 0
bgm_count: .word 0
se_count: .word 0
irq_count: .word 0
dma_count: .word 0
elapsed: .word 0
bgm: .byte 0,8,14,18,20,18,14,8,0,-8,-14,-18,-20,-18,-14,-8
effect: .byte 0,25,35,25,0,-25,-35,-25
ready: .ascii "MIX_READY 1-3 NORMAL 4-6 BGM_SUPPRESSED Q=EXIT\r\n$"
begin: .ascii "MIX_BEGIN\r\n$"
state: .ascii "MIX_STATE BGM SE IRQ DMA TICKS: $"
done: .ascii "\r\nMIX_DONE\r\n$"
