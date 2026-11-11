/* Original CC0 MSCDEX and filesystem probe. No game bytes. */
.intel_syntax noprefix
.code16
.global _start
_start:
 push cs
 pop ds
 mov ax,0x1500
 xor bx,bx
 int 0x2f
 test bx,bx
 jz no_cd
 cmp cx,3
 jne fail
 mov ax,0x150b
 mov cx,3
 int 0x2f
 test ax,ax /* MSCDEX returns nonzero, DOSBox uses 0x5ad8. */
 jz fail
 cmp bx,0xadad
 jne fail
 mov dx,offset cd_ok
 call print
 mov ax,0x3d00
 mov dx,offset path
 int 0x21
 jc fail
 mov bx,ax
 mov ah,0x3f
 mov cx,8
 mov dx,offset buffer
 int 0x21
 jc fail
 cmp ax,8
 jne fail
 cmp word ptr [buffer],3
 jne fail
 mov ah,0x3e
 int 0x21
 mov dx,offset read_ok
 call print
 mov ax,0x3d01 /* Write-only; DOSBox may downgrade READWRITE to read-only. */
 mov dx,offset path
 int 0x21
 jnc fail
 mov dx,offset readonly_ok
 call print
 mov ax,0x4c00
 int 0x21
no_cd:
 mov dx,offset absent
 call print
 mov ax,0x4c01
 int 0x21
fail:
 mov dx,offset failed
 call print
 mov ax,0x4c02
 int 0x21
print:
 mov ah,9
 int 0x21
 ret
path: .asciz "D:\\ED4\\EFFECT\\ED4-01.RAW"
cd_ok: .ascii "Q_CD_MSCDEX_D_OK\r\n$"
read_ok: .ascii "Q_CD_READ_OK\r\n$"
readonly_ok: .ascii "Q_CD_READONLY_OK\r\n$"
absent: .ascii "Q_CD_ABSENT\r\n$"
failed: .ascii "Q_CD_FAILURE\r\n$"
buffer: .space 8
