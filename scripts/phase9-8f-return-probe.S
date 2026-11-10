/* CC0 public fixture. Nested unrelated IRET must not match outer INT69. */
.code16
.intel_syntax noprefix
.global _start
_start:
 push cs
 pop ds
 mov ax,0x3569
 int 0x21
 mov word ptr [oldoff],bx
 mov word ptr [oldseg],es
 mov dx,offset handler
 mov ax,0x2569
 int 0x21
 mov ax,10
 mov bx,9
 int 0x69
 cmp ax,0x1234
 jne fail
 mov ax,9
 mov bx,10
 int 0x69
 cmp ax,0x1234
 jne fail
 mov dx,offset ok
 jmp print
fail:
 mov dx,offset bad
print:
 mov ah,9
 int 0x21
 push ds
 mov dx,word ptr [oldoff]
 mov ds,word ptr [oldseg]
 mov ax,0x2569
 int 0x21
 pop ds
 xor ah,ah
 int 0x16
 mov ax,0x4c00
 int 0x21
handler:
 push ax
 int 0x1c
 pop ax
 mov ax,0x1234
 iret
oldoff: .word 0
oldseg: .word 0
ok: .ascii "RETURN_PROBE_OK\r\n$"
bad: .ascii "RETURN_PROBE_FAILED\r\n$"
