package com.northstar.orders;

import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.lang.reflect.Modifier;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.aop.support.AopUtils;
import static org.junit.jupiter.api.Assertions.*;

class CKBoundaryTest extends DatabaseTest {
    @Autowired RequestMappingHandlerMapping mappings;
    @Autowired ApplicationContext context;
    @Test void actualHandlerDelegatesToApplicationBoundary() {
        String scenario=System.getProperty("ck.scenario");
        String route=switch(scenario) { case "reference-import" -> "/api/import/references"; case "dispatch-export" -> "/api/exports/dispatch"; default -> throw new AssertionError("unknown boundary scenario"); };
        var handlers=mappings.getHandlerMethods().entrySet().stream()
            .filter(e->e.getKey().getPatternValues().contains(route)).map(Map.Entry::getValue).toList();
        assertEquals(1,handlers.size(),"one actual endpoint mapping");
        HandlerMethod handler=handlers.getFirst();
        var classes=new ClassFileImporter().withImportOption(new ImportOption.DoNotIncludeTests()).importPackages("com.northstar.orders");
        var start=classes.get(handler.getBeanType()).getMethod(handler.getMethod().getName(),handler.getMethod().getParameterTypes());
        Set<JavaMethod> visited=new HashSet<>();
        Deque<JavaMethod> pending=new ArrayDeque<>(); pending.add(start);
        boolean serviceReached=false;
        while(!pending.isEmpty()) {
            var method=pending.removeFirst(); if(!visited.add(method)) continue;
            String pkg=method.getOwner().getPackageName();
            if(!pkg.startsWith("com.northstar.orders")) continue;
            assertFalse(pkg.contains(".legacy.dao")||pkg.contains(".persistence"),"handler must reach storage only through an application port");
            if(pkg.contains(".application")) {
                Class<?> owner=method.getOwner().reflect();
                var beans=context.getBeansOfType(owner);
                if(!beans.isEmpty() && Modifier.isPublic(method.reflect().getModifiers())) {
                    serviceReached=true;
                    if(scenario.equals("reference-import")) {
                        Transactional tx=method.reflect().getAnnotation(Transactional.class);
                        if(tx==null) tx=owner.getAnnotation(Transactional.class);
                        assertNotNull(tx,"reachable public application operation owns import transaction");
                        assertFalse(tx.readOnly(),"import transaction writes");
                        assertTrue(beans.values().stream().anyMatch(AopUtils::isAopProxy),"actual service is proxied");
                    }
                    continue; // applicationUsesPorts public rule owns the layer below
                }
            }
            assertFalse(method.isAnnotatedWith(Transactional.class),"HTTP/helper must not own transaction");
            assertFalse(method.getOwner().isAnnotatedWith(Transactional.class),"HTTP type must not own transaction");
            for(var dep:method.getOwner().getDirectDependenciesFromSelf()) {
                String target=dep.getTargetClass().getPackageName();
                assertFalse(target.contains(".legacy.dao")||target.contains(".persistence")||target.startsWith("java.sql")||target.startsWith("org.springframework.jdbc"),"actual handler type reaches storage: "+dep);
            }
            for(var call:method.getMethodCallsFromSelf()) call.getTarget().resolveMember().ifPresent(pending::add);
        }
        assertTrue(serviceReached,"actual handler must call a public application bean operation");
    }
}
