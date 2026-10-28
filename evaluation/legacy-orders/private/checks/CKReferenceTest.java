package com.northstar.orders;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CKReferenceTest extends DatabaseTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    void request(long id, Object ref, int expected) throws Exception {
        mvc.perform(post("/api/import/references").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("orderId", id, "customerReference", ref))))
            .andExpect(status().is(expected));
    }
    void unchanged() {
        assertEquals("PO-0007", jdbc.queryForObject("SELECT customer_ref FROM sales_order WHERE id=101", String.class));
        assertEquals(0, jdbc.queryForObject("SELECT version FROM sales_order WHERE id=101", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM audit_event", Integer.class));
    }
    @Test void normalizationBoundariesAndAudit() throws Exception {
        String reference = "00Ab " + "x".repeat(35); // exactly 40 normalized characters
        var before = jdbc.queryForMap("SELECT customer_id,state_code,hold_reason,fulfilment_mode,created_at FROM sales_order WHERE id=104");
        mvc.perform(post("/api/import/references").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("orderId",104,"customerReference","  "+reference+"  "))))
            .andExpect(status().isOk()).andExpect(content().json("{\"orderId\":104}", true));
        assertEquals(reference, jdbc.queryForObject("SELECT customer_ref FROM sales_order WHERE id=104", String.class));
        assertEquals(1, jdbc.queryForObject("SELECT version FROM sales_order WHERE id=104", Integer.class));
        assertEquals(before, jdbc.queryForMap("SELECT customer_id,state_code,hold_reason,fulfilment_mode,created_at FROM sales_order WHERE id=104"));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM audit_event", Integer.class));
        assertEquals(104L, jdbc.queryForObject("SELECT order_id FROM audit_event", Long.class));
        assertEquals("REFERENCE_AMENDED", jdbc.queryForObject("SELECT event_type FROM audit_event", String.class));
        assertEquals(reference, jdbc.queryForObject("SELECT detail FROM audit_event", String.class));
        assertEquals("2025-02-03T15:00Z", jdbc.queryForObject("SELECT occurred_at FROM audit_event", OffsetDateTime.class).toString());
        request(101," z ",200);
        assertEquals("z", jdbc.queryForObject("SELECT customer_ref FROM sales_order WHERE id=101", String.class));
    }
    @Test void rejectsTypesAndInvalidValuesWithoutWrites() throws Exception {
        for (Object invalid : new Object[]{123,true,Map.of("value","x"),new String[]{"x"},"", " \t\n", "x".repeat(41)}) {
            request(101,invalid,400); unchanged();
        }
        for (String body : new String[]{"{\"orderId\":101}","{\"orderId\":101,\"customerReference\":null}","{\"orderId\":0,\"customerReference\":\"x\"}"}) {
            mvc.perform(post("/api/import/references").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
            unchanged();
        }
    }
    @Test void unknownOrderDoesNotAudit() throws Exception {
        request(999999,"x",404); unchanged();
    }
    @Test void auditFailureRollsBackActualImport() throws Exception {
        jdbc.execute("ALTER TABLE audit_event ADD CONSTRAINT ck_reject_import CHECK (event_type <> 'REFERENCE_AMENDED')");
        request(101,"ROLL-BACK",500); unchanged();
    }
}
