package com.northstar.orders;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import java.time.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CKDispatchTest extends DatabaseTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    void insert(int id, int customer, String state, String mode, String hold, Instant when) {
        jdbc.update("INSERT INTO sales_order(id,customer_id,customer_ref,state_code,fulfilment_mode,hold_reason,created_at) VALUES(?,?,?,?,?,?,?)",
            id,customer,"00Ab "+id,state,mode,hold,OffsetDateTime.ofInstant(when,ZoneOffset.UTC));
    }
    void checkDate(String date, String utcCutoff) throws Exception {
        jdbc.update("UPDATE sales_order SET state_code='NEW'");
        Instant cutoff = Instant.parse(utcCutoff);
        insert(208,1,"ALLOC","WAREHOUSE",null,cutoff); // inserted out of order
        insert(201,1,"ALLOC","WAREHOUSE",null,cutoff.minusSeconds(1));
        insert(202,1,"ALLOC","WAREHOUSE",null,cutoff.plusSeconds(1));
        insert(203,2,"ALLOC","WAREHOUSE",null,cutoff.minusSeconds(1));
        insert(204,1,"ALLOC","WAREHOUSE","held",cutoff.minusSeconds(1));
        insert(205,1,"ALLOC","PICKUP",null,cutoff.minusSeconds(1));
        for (String state : new String[]{"NEW","PACK","SHIP","CANCEL"})
            insert(220+java.util.List.of("NEW","PACK","SHIP","CANCEL").indexOf(state),1,state,"WAREHOUSE",null,cutoff);
        var orders = jdbc.queryForList("SELECT * FROM sales_order ORDER BY id");
        var customers = jdbc.queryForList("SELECT * FROM customer ORDER BY id");
        var lines = jdbc.queryForList("SELECT * FROM order_line ORDER BY order_id,sku");
        mvc.perform(get("/api/exports/dispatch").param("businessDate",date)).andExpect(status().isOk())
            .andExpect(content().json("[{\"id\":201,\"customerReference\":\"00Ab 201\"},{\"id\":208,\"customerReference\":\"00Ab 208\"}]",true));
        assertEquals(orders,jdbc.queryForList("SELECT * FROM sales_order ORDER BY id"));
        assertEquals(customers,jdbc.queryForList("SELECT * FROM customer ORDER BY id"));
        assertEquals(lines,jdbc.queryForList("SELECT * FROM order_line ORDER BY order_id,sku"));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM audit_event",Integer.class));
    }
    @Test void winterInclusiveCutoffAndEligibility() throws Exception { checkDate("2025-02-03","2025-02-03T22:00:00Z"); }
    @Test void summerCutoffUsesDaylightSaving() throws Exception { checkDate("2025-07-15","2025-07-15T21:00:00Z"); }
    @Test void springTransitionDate() throws Exception { checkDate("2025-03-09","2025-03-09T21:00:00Z"); }
    @Test void autumnTransitionDate() throws Exception { checkDate("2025-11-02","2025-11-02T22:00:00Z"); }
    @Test void invalidDate() throws Exception {
        mvc.perform(get("/api/exports/dispatch")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/exports/dispatch").param("businessDate","2025-02-30")).andExpect(status().isBadRequest());
    }
}
