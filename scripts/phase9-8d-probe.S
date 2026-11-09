/* CC0. Synthetic INT66 receiver, RAW/EFC buffers; no commercial driver/code. */
.code16
.intel_syntax noprefix
.global _start
_start:
 push cs
 pop ds
 mov ax,0x3569
 int 0x21
 mov word ptr [old69off],bx
 mov word ptr [old69seg],es
 mov dx,offset handler
 mov ax,0x2569
 int 0x21
 mov ax,9
 mov bx,7
 int 0x69
 mov ax,0x3566
 int 0x21
 mov word ptr [oldoff],bx
 mov word ptr [oldseg],es
 mov dx,offset handler
 mov ax,0x2566
 int 0x21
 mov word ptr [snd+2],cs
 mov word ptr [snd+8],cs
 mov dx,offset rawname
 call readfile
 mov ax,0x698
 mov dx,3
 int 0x66
 mov ax,0x69c
 mov dx,1
 int 0x66
 mov si,offset snd
 mov ax,0x688
 int 0x66
 mov ax,0x695
 int 0x66
 mov ax,0x68f
 int 0x66
 /* Bad pointer is observed but never dereferenced by the observer. */
 push ds
 mov ax,0xffff
 mov ds,ax
 mov si,0xffff
 mov ax,0x688
 int 0x66
 pop ds
 mov dx,offset efcname
 call readfile
 mov si,offset snd
 mov ax,0x688
 int 0x66
 mov ax,9
 mov bx,8
 int 0x69
 mov ax,0x000a
 int 0x69
 mov cx,700
again:
 mov ax,0x698
 int 0x66
 loop again
 mov dx,word ptr [oldoff]
 push ds
 mov ds,word ptr [oldseg]
 mov ax,0x2566
 int 0x21
 pop ds
 push ds
 mov dx,word ptr [old69off]
 mov ds,word ptr [old69seg]
 mov ax,0x2569
 int 0x21
 pop ds
 mov dx,offset ok
 mov ah,9
 int 0x21
 xor ah,ah
 int 0x16
 mov ax,0x4c00
 int 0x21
readfile:
 mov ax,0x3d00
 int 0x21
 jc fail
 mov bx,ax
 mov cx,12
 mov dx,offset buffer
 mov ah,0x3f
 int 0x21
 jc fail
 cmp ax,12
 jne fail
 mov ah,0x3e
 int 0x21
 ret
fail:
 mov dx,offset bad
 mov ah,9
 int 0x21
 mov ax,0x4c01
 int 0x21
.ascii "KERN"
.word 0
handler: iret
old69off: .word 0
old69seg: .word 0
oldoff: .word 0
oldseg: .word 0
status: .word 0x1234
snd: .word buffer+8,0,4,status,0,22050
buffer: .space 16
rawname: .asciz "ED4-01.RAW"
efcname: .asciz "TEST.EFC"
ok: .ascii "BGM_PROBE_OK\r\n$"
bad: .ascii "BGM_PROBE_READ_FAILED\r\n$"
