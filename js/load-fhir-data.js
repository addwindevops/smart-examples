(function(){
  FhirLoader = {};

  FhirLoader.demographics = function() {
    var dfd = $.Deferred();

    smart.context.patient.read().done(function(pt) {

      var patient = pt.entry[0].resource;
      var name = patient.name[0].given.join(" ") +" "+ patient.name[0].family.join(" ");
      var birthday = new Date(patient.birthDate).toISOString();
      var gender = patient.gender;

      dfd.resolve({
        name: name,
        gender: gender,
        birthday: birthday
      });

    }).fail(function(e) {
      dfd.reject(e.message);
    });

    return dfd.promise();
  };

  FhirLoader.vitals = function() {
    var dfd = $.Deferred();
    $.when(getObservations(),getEncounters()).then(function(observations,encounters) {
        dfd.resolve(processObservations(observations,encounters));
    });
    return dfd.promise();
  }
  
  /*
  function cachedLink(items, target) {
    var match = null;
    items.forEach(function(r) {
        var rid = r.resourceType + '/' + r.id;
        if (rid === target.reference) {
            match = r;
        }
    });
    return match;
  }
  */

  function processObservations(observations, encounters){

    var vitals = {heightData: [], bpData: []};

    var vitalsByCode = smart.byCode(observations, 'code');

    (vitalsByCode['8302-2']||[]).forEach(function(v){
      vitals.heightData.push({
        vital_date: v.appliesDateTime,
        height: smart.units.cm(v.valueQuantity)
      }); 
    });

    (vitalsByCode['55284-4']||[]).forEach(function(v){

      var components = smart.byCode(v.related.map(function(c){
        //return cachedLink(observations, c.target);
        var a = smart.fhir.resolveSync({reference:c.target, resource:v});
        return smart.fhir.resolveSync({reference:c.target, resource:v});
      }), 'code');

      var diastolicObs = components["8462-4"][0];
      var systolicObs = components["8480-6"][0];
      var systolic = systolicObs.valueQuantity.value;
      var diastolic = diastolicObs.valueQuantity.value;
      var extensions = v.extension;
      var obj = {
        vital_date: v.appliesDateTime,
        systolic: systolic,
        diastolic: diastolic
      };
      
      if (extensions) {
          $.each(extensions, function(index, extension){
              if (extension.url === "http://fhir-registry.smarthealthit.org/StructureDefinition/vital-signs#position") {
                 var coding = extension.valueCodeableConcept.coding[0];
                 obj["bodyPositionCode"] = coding.system + coding.code;
              } else if (extension.url === "http://fhir-registry.smarthealthit.org/StructureDefinition/vital-signs#encounter"){
                var encounter = smart.cachedLink(v, extension.valueResource);
                var encounter_type = encounter.class;
                if (encounter_type === "outpatient") {
                    encounter_type = "ambulatory";
                }
                obj["encounterTypeCode"] = "http://smarthealthit.org/terms/codes/EncounterType#" + encounter_type;
              }
          });
      }
      if (v.bodySiteCodeableConcept) {
        obj["bodySiteCode"] = v.bodySiteCodeableConcept.coding[0].system + v.bodySiteCodeableConcept.coding[0].code;
      }

      if (v.method) {
        obj["methodCode"] = v.method.coding[0].system + v.method.coding[0].code;
      }
      
      obj["encounterTypeCode"] = "http://smarthealthit.org/terms/codes/EncounterType#ambulatory";
      
      vitals.bpData.push(obj);
    });

    return vitals;
  };
  
  function getNext (bundle) {
        var i;
        var d = bundle.entry;
        var entries = [];
        for (i = 0; i < d.length; i++) {
            entries.push(d[i].resource);
        }
        var def = $.Deferred();
        smart.fhir.nextPage({bundle:bundle}).then(function (r) {
            $.when(getNext(r)).then(function (t) {
                def.resolve(entries.concat(t));
            });
        }, function(err) {def.resolve(entries)});
        return def.promise();
  }

  function getObservations(){
        var ret = new $.Deferred();
        
        smart.fhir.search({type: "Observation", 
           query: {subject: {$type: 'Patient', id: {$exact: smart.patientId}}}
        }).then(function(data){
            $.when(getNext(data)).then(function(r) {
                ret.resolve(r);
            });
        });
          
        return ret;
  };
  
  function getEncounters(){
        var ret = new $.Deferred();
        
        smart.fhir.search({type: "Encounter", 
           query: {patient: {$type: 'Patient', id: {$exact: smart.patientId}}}
        }).then(function(data){
            $.when(getNext(data)).then(function(r) {
                ret.resolve(r);
            });
        });
          
        return ret;
  };

})();
