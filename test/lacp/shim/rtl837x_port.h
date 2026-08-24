/* Host-build shim: the harness mocks trunk programming and records calls */
#ifndef _SHIM_RTL837X_PORT_H_
#define _SHIM_RTL837X_PORT_H_
#include <stdint.h>
void port_lag_members_set(uint8_t lag, uint16_t members);
uint16_t port_lag_members_get(uint8_t lag);
void port_isolate(uint8_t port, uint16_t pmask);
uint16_t port_pvid_get(uint8_t port);
uint8_t port_link_class(uint8_t port);
#endif
