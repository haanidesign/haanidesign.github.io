// Pinokio - builds a round controller for the effect.
//
// Select a layer that already has Pinokio on it and run this script. It adds a
// null you drag inside a circle: left and right turns the head, up and down
// nods it, and rotating the null tilts it. Keyframe the null's Position and
// Rotation as usual.
//
// File > Scripts > Run Script File...

(function pinokioController() {

    var RANGE = 100;   // how far the null travels for a full turn, in pixels

    function findGroup(group, name) {
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i);
            if (p.name === name) return p;
            if (p.numProperties) {
                var hit = findGroup(p, name);
                if (hit) return hit;
            }
        }
        return null;
    }

    var comp = app.project.activeItem;
    if (!(comp && comp instanceof CompItem)) {
        alert("Open a composition first.");
        return;
    }

    var layers = comp.selectedLayers;
    if (layers.length !== 1) {
        alert("Select the one layer that has Pinokio on it.");
        return;
    }

    var target = layers[0];
    var effects = target.property("ADBE Effect Parade");
    var pinokio = null;
    for (var i = 1; effects && i <= effects.numProperties; i++) {
        if (effects.property(i).matchName === "HAANI Pinokio") {
            pinokio = effects.property(i);
            break;
        }
    }
    if (!pinokio) {
        alert("That layer has no Pinokio effect on it.");
        return;
    }

    var pose = findGroup(pinokio, "Pose");
    if (!pose) {
        alert("Could not find Pinokio's Pose group.");
        return;
    }

    app.beginUndoGroup("Pinokio controller");

    // The circle is only a guide, so it is locked and carries no pixels of its
    // own that would end up in the render.
    var guide = comp.layers.addShape();
    guide.name = "Pinokio Guide";
    var group = guide.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    var contents = group.property("ADBE Vectors Group");
    var circle = contents.addProperty("ADBE Vector Shape - Ellipse");
    circle.property("ADBE Vector Ellipse Size").setValue([RANGE * 2, RANGE * 2]);
    var stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
    stroke.property("ADBE Vector Stroke Width").setValue(1.5);
    stroke.property("ADBE Vector Stroke Color").setValue([0.6, 0.6, 0.6, 1]);
    guide.guideLayer = true;
    guide.locked = true;

    var ctl = comp.layers.addNull();
    ctl.name = "Pinokio Controller";
    ctl.guideLayer = true;

    // Remember where the null started; the pose is read as a drift from there.
    var home = ctl.property("ADBE Transform Group").property("ADBE Position").value;

    var head =
        'var c = thisComp.layer("Pinokio Controller");\n' +
        'var home = [' + home[0] + ', ' + home[1] + '];\n' +
        'var range = ' + RANGE + ';\n' +
        'var d = c.transform.position - home;\n';

    function limit(axis, max) {
        return head +
            'var t = clamp(d[' + axis + '] / range, -1, 1);\n' +
            't * ' + max + ';';
    }

    pose.property("Yaw").expression   = limit(0, 20);
    pose.property("Pitch").expression = limit(1, 20);
    pose.property("Roll").expression  =
        'var c = thisComp.layer("Pinokio Controller");\n' +
        'clamp(c.transform.rotation, -15, 15);';

    guide.moveToBeginning();
    ctl.moveToBeginning();
    ctl.selected = true;

    app.endUndoGroup();

    alert("Drag \"Pinokio Controller\" inside the circle to turn the head,\n" +
          "and rotate it to tilt.");
})();
